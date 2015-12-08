# monetdb-import
[![Build Status](https://travis-ci.org/MonetDB/npm-monetdb-import.svg)](https://travis-ci.org/MonetDB/npm-monetdb-import)
[![npm version](https://badge.fury.io/js/monetdb-import.svg)](http://badge.fury.io/js/monetdb-import)

This module provides an easy API for loading data files into [MonetDB](https://www.monetdb.org).

If you want to import data with [MonetDB](https://www.monetdb.org), then the [bulk input](https://www.monetdb.org/Documentation/Manuals/SQLreference/CopyInto) normally is the way to go. This however requires you to know what your data files look like. You have to know the delimiters, newline characters, quote characters, the number of lines in the file, whether or not header labels can be found on the first row, and so on. Other than that, you also have to manually create a table that will be used to store your file. For that you have to know the column types, column names, etc. That can be quite annoying.

This module has been designed to do all of this for you. It is able to do this by using the [csv-sniffer](https://www.npmjs.org/package/csv-sniffer) module. Furthermore, it uses the [MonetDB connector for NodeJS](https://www.npmjs.org/package/monetdb) to interact with your database.

The **monetdb-import** module takes a delimited text file (binaries not supported), figures out its details, creates appropriate storage for it inside your [MonetDB](https://www.monetdb.org) database and then imports it in there. It literally does **everything**. It is similar to the [Python MonetDB importer](http://homepages.cwi.nl/~hannes/importer.py), but then written in NodeJS, and with more flexibility in terms of specifying the import parameters.

# Installation
npm install [-g] monetdb-import

# Dependencies
This module depends on the following modules:
- [monetdb](https://www.npmjs.org/package/monetdb): Necessary for creating a connection to a [MonetDB](https://www.monetdb.org) server process
- [csv-sniffer](https://www.npmjs.org/package/csv-sniffer): Necessary for auto detection of crucial file information that we need to import files into [MonetDB](https://www.monetdb.org).
- [q](https://www.npmjs.org/package/q): To write clean code.

# Usage
Basically, you can use two approaches in using the **monetdb-import** module.

1. Let the **monetdb-import** module do everything for you. This will work for most of the files. However, in case sniffing fails to find the right parameters, data might end up in the database other than you would expect it to.
2. Use the **monetdb-import** module in an interactive fashion. You will get passed back the outcome of the [csv-sniffer module](https://www.npmjs.org/package/csv-sniffer). In case you are unhappy with this result, you can tweak the parameters and do another round of sniffing. This process continues until you are happy with the parameters you have found and at that point you can let the **monetdb-import** do the actual import. This approach is extremely useful for, but of course not limited to, building (web)applications that allow users to interactively import their files into the database.


### Simple example
This example demonstrates the easiest possible use of this module. It passes database connection details, a file to import, and a table name that will be created to the Importer constructor. The import process is then started by calling the import method, which calls a callback on completion.
```javascript
var Importer = require('monetdb-import')();

var dbOptions = {
	dbname: 'demo'
}

try {
	var imp = new Importer(dbOptions, '/path/to/my/file', 'fancy_table_name');

	imp.import(function(err) {
		if(err) {
			console.log('Could not import file /path/to/my/file; Reason: '+err);
		}

		console.log('File /path/to/my/file successfully imported into database table fancy_table_name');
	});
} catch(e) {
	// Could not construct the importer object. Possible reasons: 
	// 1) Invalid parameters
	// 2) file not found 
	// 3) file is binary
	console.log(e.message);
}

```

### <a name="interactive"></a>Interactive example
This example demonstrates how you can interactively add a file to the database. The Importer object can be constructed in the same way as in the previous example, but instead of immediately calling import, you can call a sniffing function iteratively, until you are happy with its result and then pass this result to the import function to finish the import process.

```javascript
var Importer = require('monetdb-import')();

var dbOptions = {
	dbname: 'demo',
}

var imp = new Importer(dbOptions, '/path/to/my/file', 'fancy_table_name');

var sniffOptions = { /* Some optional initial sniffing options */ }
imp.sniff(sniffOptions, function(err, sniffResult) {
	if(err) throw new Error(err);

	// Investigate sniffResult here...

	// If we decide that we are not happy with the sniff result, we can
	// just do another sniffing round with new options

	sniffOptions.delimiter = '\t'; // just an example

	imp.sniff(sniffOptions, function(err, sniffResult) {
		if(err) throw new Error(err);

		// Let's assume that we are happy with the sniff result now
		// We can then finish the import process
		imp.import(sniffResult, function(err) {
			if(err) {
				console.log('Could not import file /path/to/my/file; Reason: '+err);
			}

			console.log('File /path/to/my/file successfully imported into database table fancy_table_name');
		});
	});
});

```


# API

#### <a name="importer"></a>Importer(dbOptions, [importOptions], filepath, [schemaname], tablename, [delimiters])
Constructor for an Importer object. The constructor will throw an error when it fails to construct. This can be due to e.g. invalid parameters, a non-existing file, or a quick check turned out that the given file is binary.

- dbOptions [object]: In case you already have either a [MonetDBConnection object](https://github.com/MonetDB/monetdb-nodejs#mdbconnection) or a [MonetDBPool object](https://github.com/MonetDB/monetdb-pool-nodejs) in your code, you can add a property 'conn' to dbOptions (i.e. dbOptions = {conn: yourConnectionObject}). If the 'conn' property is found (and is a valid MonetDBConnection or MonetDBPool object), all other properties will be ignored.
In case the 'conn' property is missing, we will instantiate a MonetDBConnection object ourselves and we expect the dbOptions object to contain the properties needed to do so. These properties are given on the module page of the [monetdb module](https://www.npmjs.org/package/monetdb).
- importOptions [object]: Optional object containing the following optional properties:
	- sampleSize [integer]: The maximum number of bytes to read from the import file for the sniffing process. If it is set to <= 0, the whole file contents will be read and fed to the sniffer. This might not be what you want for big files, since the sniffing process can be quite memory intensive. (default: 0 (so by default reads your entire file)).
	- locked [boolean]: If set to true, the LOCKED keyword will be added to the [COPY INTO statement](https://www.monetdb.org/Documentation/Manuals/SQLreference/CopyInto) (default: true).
    - nullString [string]: If a value is found in your file that equals this string, it is considered as NULL. (Note that you should omit single quotes, we will add them) (default: '')
    - rejectsLimit [int]: Optional limit for the size of the rejects table that will be returned. Defaults to 100.
  If the importOptions object is omitted entirely, all defaults will be assumed.
- filepath [string]: The path of the file that will be added to the database. Note that this import module only handles delimited text files, no binaries.
- schemaname [string]: The name of the [schema](https://www.monetdb.org/Documentation/SQLreference/Schema) to which the file table will be added. Note that importing will fail if the schema does not exist. (default: sys).
- tablename [string]: The name of the table that will be created in [MonetDB](https://www.monetdb.org) to hold the contents of the given file. Note that importing will fail if the table already exists. 
- delimiters [array]: Array that represents a set of strings that are possible column delimiters. This
list of delimiters will be passed to the [csv-sniffer constructor](https://www.npmjs.org/package/csv-sniffer) (default: null)


#### <a name="sniff"></a>Importer.sniff([sniffOptions], fn):
This method allows you to use this module in an interactive way (see [interactive example](#interactive)).

- sniffOptions [object]: Optional object that will be passed on to the sniff method of the [csv-sniffer](https://www.npmjs.org/package/csv-sniffer) during importing. See the [csv-sniffer API](https://www.npmjs.org/package/csv-sniffer) for details on the possible options. If the sniffOptions are omitted or set to null, everything will be auto-detected by the CSV sniffer.
- fn [function]: Callback function that will be called whenever the sniffer completes. The first argument of this function is an error message or null on success. On success, the second argument contains the sniff result. For details on the sniff result, see [csv-sniffer sniffresult](https://www.npmjs.org/package/csv-sniffer#sniffresult).


#### <a name="import"></a>Importer.import([sniffResult], [fn]):
This method does the actual import process.

- sniffResult [object]: If this argument is not provided, the import method collects the sniff data itself by doing an internal call to [Importer.sniff](#sniff). If you do provide this argument, it should be an object as it results from a call to [Importer.sniff](#sniff), i.e. it must follow the format for the [csv-sniffer sniffresult](https://www.npmjs.org/package/csv-sniffer#sniffresult).
- fn [function]: This callback function gets called when the import completes, with the following two arguments:
1. An error message will be provided here when import failed, null otherwise. 
2. The second argument is an object with the following properties:
    - importedRows [int]: The number of rows imported into MonetDB, or -1 when unknown.
    - rejectedRows [int]: The number of rows that could not be imported into MonetDB, or -1 when unknown.
    - rejects: [array] This property is only set if the best effort mode was used during import (see [bestEffort](bestEffort) for more information about 'best effort' mode.
      This array will contain an object for every import failure, with the following structure: 
        - rowid [integer]: The number of the rejected row
        - fldid [integer]: The number of the field of the rejected row
        - message [string]: A message describing the reason of the reject
        - input [string]: The input row that failed
      The maximum number of array entries is determined by the rejectsLimit number in the importOptions provided to the [Importer object](#importer)


#### <a name="prepareLabels"></a>Importer.prepareLabels(sniffResult, [options]):
This is a *STATIC* method, meaning that you can call this method on the Importer constructor without having to create an
Importer object first. It is used from within every Importer object to transform the labels in the [csv-sniffer sniffresult](https://www.npmjs.org/package/csv-sniffer#sniffresult) into an array of column names suitable for insertion into MonetDB. 
- sniffResult [object]: Object that obeys the conventions of the output of the [csv-sniffer sniffresult](https://www.npmjs.org/package/csv-sniffer#sniffresult)
- options [object]: Optional options object
	- labelFn [function]: The function to use to construct a label out of an index (see [setLabelFn](#setLabelFn) for more details)
	- labelTransformFn [function]: The function to use to transform a label into a format suitable for MonetDB (see [setLabelTransformFn](#setLabelTransformFn) for more details)

The function performs the following operations:
- Use the records array in the sniff result to determine the max number of columns in any row
- Extend the labels array to include enough values for the col max found in the previous step,
  by using the [label fn](#setLabelFn)
- Apply [label transform fn](#setLabelTransformFn) to all labels
- Replace any empty values with a label generated with the label fn
- Extend any duplicate values with '{{value}}(i)'





### Advanced configuration
The default configuration will in most cases be sufficient. If it is not, you can use the following methods to have full control over the import process.

#### <a name="bestEffort"></a>Importer.bestEffort(b):

This function allows you to use the (experimental) 'best effort' mode of the MonetDB COPY INTO command.
This mode imports as many rows as it can from your file, without failing when it enounters rows that it can not insert.

This feature is set to false by default, but with this function you can enable it.
If enabled, rows that failed to load into the database will be provided to the callback function of the [import](Import) function.

- b [boolean]: Boolean that sets or unsets 'best effort' mode.

#### <a name="setLabelFn"></a>Importer.setLabelFn(fn):

- fn [function]: Function that will be used to generate a label from a column index. This
function will be used whenever column labels are not on the first row of the import file.
This labeling function receives a column index as its only parameter. Default: 

```
function labelFn(i) {
	return "C"+i;
}
```
  Note that this function **must always** return a value that can be used as a column name in a database. If it fails to follow this convention (e.g. there is a space in there), then the SQL query that will be executed to create a table will fail.


#### <a name="setLabelTransformFn"></a>Importer.setLabelTransformFn(fn):
- fn [function]: Function that is called to make column labels database-ready. This function will only be called when column labels are taken directly from the first row of your file (otherwise, the [Importer.setLabelFn](#setLabelFn) will be called to generate labels). The following default function is used if you do not provide your own function:

```javascript
function labelTransformFn(label) {
	return label.toLowerCase()
			.replace(/\s/g, "_")
			.replace(/'/g, "")
			.replace(/"/g, "")
			.replace(/\n/g, " | ")
			.replace(/\r/g, "");
};
```


#### Importer.setSqlLogFn([fn]):

- fn [function]: Sets the SQL logging function called whenever this module executes a SQL query on your database. It receives a single argument: the SQL query that is executed. If omitted or set to null, queries will not be logged. Default function is console.log.


# Q Integration
For those of you who would like to interface with the monetdb-import module through using promises: The asynchronous methods in the Importer object ([Importer.sniff](#sniff) and [Importer.import](#import)) have promise-returning variants: Importer.sniffQ and Importer.importQ.



### Using this module should be a breeze. Don't agree? Please report any suggestions/bugs to robin.cijvat@monetdbsolutions.com
