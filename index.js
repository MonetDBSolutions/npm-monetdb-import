var fs = require("fs");

var q = require("q");
var csvParse = require("csv-parse");
var MonetDB = require("monetdb");
var CSVSniffer = require("csv-sniffer")();

// Private functions that are not tied to the Importer object and thus do not use the this keyword
function __typeCheck(type, valueToCheck, optional) {
	var correct = typeof(valueToCheck) == type;
	if(optional) {
		// Exception if the variable is optional, than it also may be undefined or null
		correct = correct || valueToCheck === undefined || valueToCheck === null;
	} 
	if(!correct) {
		throw new Error("Invalid argument type received; expected "+type+
			", but received "+typeof(valueToCheck));
	}
}

function __typeToDbType(type) {
	switch(type) {
		case "string":  return "STRING"; break;
		case "float":   return "DOUBLE"; break;
		case "integer": return "BIGINT"; break;
		default: 	    return "STRING"; break;
	}
}


module.exports = function() {
	function Importer(dbOptions, importOptions, filepath, schemaname, tablename, delimiters) {
		// Shift if importOptions is missing
		if(typeof(importOptions) != "object") {
			// optional importOptions not provided, shift parameters
			delimiters = tablename;
			tablename = schemaname;
			schemaname = filepath;
			filepath = importOptions;
			var importOptions = {};
		}
		// Shift if schemaname is missing
		if(typeof(tablename) != "string") {
			delimiters = tablename;
			tablename = schemaname;
			var schemaname = "sys";
		}

		__typeCheck("object", dbOptions);
		__typeCheck("object", importOptions, true);
		__typeCheck("string", filepath);
		__typeCheck("string", schemaname, true);
		__typeCheck("string", tablename);
		__typeCheck("object", delimiters, true);

		// private variables
		var _conn = null;
		var _closeConn = false; // set to true if we create a connection ourselves
		var _filepath = filepath;
		var _schemaname = schemaname;
		var _tablename = tablename;
		var _importOptions = importOptions;
		var _parseOptions = null;
		var _labelFn = function(i) {
			return "C"+i;
		};
		var _labelTransformFn = function(label) {
			return label.toLowerCase()
					.replace(" ", "_")
					.replace("'", "")
					.replace('"', "")
					.replace("\t", "  ")
					.replace("\n", " | ")
					.replace("\r", "");
		};
		var _sqlLogFn = console.log;
		var _sniffer = new CSVSniffer(delimiters);
		var _sample = null;

		// private functions
		function _query(query) {
			_sqlLogFn && _sqlLogFn(query);
			return _conn.queryQ(query);
		}

		function _getSample() {
			if(_sample) {
				return q.when(_sample);
			}
			return q.nfcall(fs.stat, _filepath).then(function(stat) {
				return q.nfcall(fs.open, _filepath, "r").then(function(fd) {
					var bytesToRead = Math.min(_importOptions.sampleSize, stat.size);
					var buf = new Buffer(bytesToRead);
					return q.nfcall(fs.read, fd, buf, 0, bytesToRead, 0).then(function(bytesRead) {
						_sample = buf.toString();
						return _sample;
					});
				});
			});
		}

		function _getTablename() {
			return '"'+_schemaname+'"."'+_tablename+'"';
		}



		var that = this;

		// priviliged functions (meaning they are public but can access the private variables)

		this.sniff = function(sniffOptions, fn) {
			if(typeof(sniffOptions) != "object") {
				// optional sniffOptions not provided, shift parameters
				fn = sniffOptions;
				var sniffOptions = null;
			}

			__typeCheck("object", sniffOptions, true);
			__typeCheck("function", fn);

			_getSample().then(function(sample) {
				try {
					var sniffResult = _sniffer.sniff(sample, sniffOptions);

					// sniffResult calculated... calculate fileStats
					var fileStats = {};
					_parseOptions.delimiter = sniffResult.delimiter;
					_parseOptions.rowDelimiter = sniffResult.newlineStr;
					_parseOptions.quote = sniffResult.quoteChar;

					q.nfcall(csvParse, sample.substring(0, _importOptions.maxCharsInRecords), _parseOptions).then(function(records) {
						fileStats.labels = sniffResult.hasHeader ? records.slice(0, 1) : null;
						fileStats.records = sniffResult.hasHeader ? 
												records.slice(1, _importOptions.maxRecords+1) : 
												records.slice(0, _importOptions.maxRecords);

						if(fileStats.labels && fileStats.labels.length > 0) {
							fileStats.labels = fileStats.labels[0].map(_labelTransformFn);
						} else {
							// if the file does not contain a header, we generate one ourselves
							fileStats.labels = [];

							// first, find the # of columns that occurs the most in the parse result
							var colCountOccurrences = [];
							records.forEach(function(row) {
								if(!colCountOccurrences[row.length]) {
									colCountOccurrences[row.length] = 1;
								} else {
									++colCountOccurrences[row.length];
								}
							});
							var nrCols = -1;
							Object.keys(colCountOccurrences).forEach(function(d) {
								nrCols = Math.max(nrCols, parseInt(d));
							});

							// generate list of headers for this nr of cols
							for(var i=1; i<=nrCols; ++i) {
								fileStats.labels.push(_labelFn(i));
							}
						}

						// count the number of lines in the file, resolve/reject when this completes
						var deferred = q.defer();
						fileStats.nrLines = 1; // file always has one line, even if it is completely empty
						fs.createReadStream(_filepath).on("data", function(chunk) {
							var matches = chunk.toString().match(new RegExp(sniffResult.newlineStr, "g")) || [];
							fileStats.nrLines += matches.length;
						}).on("end", function() {
							deferred.resolve();
						}).on("error", function(err) {
							// Error while reading file... 
							deferred.reject(err);
						});
						return deferred.promise;
					}).then(function() {
						// Successfully calculated filestats, pass result back to callback function
						fn(null, { sniffResult: sniffResult, fileStats: fileStats });
					}, function(err) {
						fn("Could not calculate file stats of "+_filepath+" ("+err+")");
					}).done();

				} catch(err) {
					fn("Failed to sniff file stats of "+_filepath+" ("+err+")");
				}
			}, function(err) {
				fn("Could not sample file "+_filepath+" ("+err+")")
			})
		}

		this.import = function(sniffData, fn) {
			// Check arguments and shift if necessary
			if(typeof(sniffData) != "object") {
				fn = sniffData;
				var sniffData = null;
			}
			__typeCheck("object", sniffData, true);
			__typeCheck("function", fn);

			if(!sniffData) {
				sniffData = that.sniffQ();
			}

			var databaseCheckPromise = _query("SELECT COUNT(*) FROM "+_getTablename()).then(function() {
				// Query succeeded, meaning table exists...
				throw new Error("Table "+_getTablename()+" already exists!");
			}, function() {
				// Failure, which is exactly what we needed! Return true to resole promise
				return true;
			});

			q.spread([
				q.when(sniffData),
				_getSample(),
				databaseCheckPromise
			], function(sniffData, sample) {
				// Try to create a table that can be used to store the file
				var labelsQuoted = sniffData.fileStats.labels.map(function(label) {
					return '"'+label.replace('"', "")+'"';
				});
				return _query(
					"CREATE TABLE "+_getTablename()+" ("+
						labelsQuoted.map(function(col, i) { 
							return col+" "+__typeToDbType(sniffData.sniffResult.types[i]); 
						}).join(",\n")+
					")"
				).then(function() {
					return sniffData;
				}, function(err) { 
					throw new Error("Could not create database table "+_getTablename()+" ("+err+")");
				});
			}).then(function(sniffData) {
				// Table is in place; we can now do the actual import
				var offset = sniffData.sniffResult.hasHeader?"2":"1";
				var delimiterStr = null;
				if(sniffData.sniffResult.delimiter) {
					delimiterStr = "'"+sniffData.sniffResult.delimiter+"'";
					if(sniffData.sniffResult.newlineStr) {
						delimiterStr += ", '"+sniffData.sniffResult.newlineStr+"'";
						if(sniffData.sniffResult.quoteChar) {
							delimiterStr += ", '"+sniffData.sniffResult.quoteChar+"'";
						}
					}
				}
				return _query( // Note: nrLines > actual nr of records in input, but this is ok since MonetDB only expects an upper bound.
					"COPY "+sniffData.fileStats.nrLines+" OFFSET "+offset+" RECORDS \n"+
					"INTO "+_getTablename()+" \n"+
					"FROM ('"+_filepath+"') "+
					(delimiterStr ? "DELIMITERS "+delimiterStr+"\n" : "")+
					"LOCKED");
			}).then(function() {
				// Import successful! 
				fn && fn(null);
			}, function(err) { 
				fn && fn("Import failed. Reason: "+err);
			}).fin(function() {
				if(_closeConn) {
					_conn.close();
				}
			}).done();
		}


		this.setParseOptions = function(parseOptions) {
			__typeCheck("object", parseOptions, true);
			var opt = parseOptions ? parseOptions : {};
			if(!opt.escape) 						opt.escape = '\\';
			if(!opt.comment) 						opt.comment = null;
			if(opt.skip_empty_lines === undefined)  opt.skip_empty_lines = true;
			if(opt.auto_parse === undefined) 		opt.auto_parse = false;
			_parseOptions = opt;
		}

		this.setLabelFn = function(fn) {
			__typeCheck("function", fn);
			_labelFn = fn;
		}

		this.setLabelTransformFn = function(fn) {
			__typeCheck("function", fn);
			_labelTransformFn = fn;
		}

		this.setSqlLogFn = function(fn) {
			__typeCheck("function", fn, true);
			_sqlLogFn = fn;
		}



		// initialize database connection
		if(dbOptions.conn) {
			_conn = dbOptions.conn;
		} else {
			_closeConn = true; // indicate that the connection should be closed afterwards
			_conn = MonetDB.connect(dbOptions, function(err) {
				if(err) {
					throw new Error("Could not create a connection to the database: "+err);
				}
			});
		}
		if(!_conn.options.q) {
			_conn.options.q = q;
		}

		// initialize default options
		if(!_importOptions.sampleSize) 			_importOptions.sampleSize = 131072;
		if(!_importOptions.maxRecords) 			_importOptions.maxRecords = 10;
		if(!_importOptions.maxCharsInRecords)  	_importOptions.maxCharsInRecords = 2048;

		this.setParseOptions(null);
	}

	// Q Integration
	["sniff", "import"].forEach(function(funToQ) {
		var funQ = funToQ + 'Q';
		Importer.prototype[funQ] = function() {
			return q.npost(this, funToQ, arguments);
		}
	});

	return Importer;
}
