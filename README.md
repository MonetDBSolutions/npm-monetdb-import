# monetdb-import
If you are looking for an easy way to import data into [MonetDB](https://www.monetdb.org), look no further.

If you want to import data with [MonetDB](https://www.monetdb.org), then the [bulk input](https://www.monetdb.org/Documentation/Manuals/SQLreference/CopyInto) normally is the way to go. This however requires you to know what your data files look like. You have to know the delimiters, newline characters, quote characters, the number of lines in the file, whether or not header labels can be found on the first row, and so on. That can be quite annoying.

This module has been designed to do all of this for you. It is able to do this by using the [csv-sniffer](https://www.npmjs.org/package/csv-sniffer) module. Furthermore, it uses the [MonetDB connector for NodeJS](https://www.npmjs.org/package/monetdb) to interact with your database.

The **monetdb-import** module takes your plain text file (binaries not supported), figures out its details, creates appropriate storage for it inside your [MonetDB](https://www.monetdb.org) database and then imports it in there. It literally does **everything**. It is similar to the [Python MonetDB importer](http://homepages.cwi.nl/~hannes/importer.py), but then written in NodeJS, and with more flexibility in terms of specifying the import parameters.

# Installation
npm install [-g] monetdb-import

# Dependencies
This module depends on the following modules:
- [monetdb](https://www.npmjs.org/package/monetdb): Necessary for creating a connection to a [MonetDB](https://www.monetdb.org) server process
- [q](https://www.npmjs.org/package/q): The flow of callbacks can get quite complex inside this module, so therefore we chose to use q functionality inside our code to make for a clear programming style.
- [csv-sniffer](https://www.npmjs.org/package/csv-sniffer): Necessary for auto detection of crucial file information that we need to import files into [MonetDB](https://www.monetdb.org).

# Usage
Basically, you can use two approaches in using the **monetdb-import** module.

1. Let the **monetdb-import** module do everything for you. This will work for most of the files. However, in case sniffing fails to find the right parameters, data might end up in the database other than you would expect it to.
2. Use the **monetdb-import** module in an interactive fashion. You will get passed back the outcome of the [csv-sniffer module](https://www.npmjs.org/package/csv-sniffer). In case you are unhappy with this result, you can tweak the parameters and do another round of sniffing. This process continues until you are happy with the parameters you have found and at that point you can let the **monetdb-import** do the actual import. This approach is extremely useful for, but of course not limited to, building (web)applications that allow users to interactively import their files into the database.


### Simple example
This example demonstrates the easiest possible use of this module. It passes database connection details, a file to import, and a table name that will be created to the Importer constructor. The import process is then started by calling the import method, which calls a callback on completion.
```
var Importer = require('monetdb-import')();

var dbOptions = {
	dbname: 'demo'
}

var imp = new [Importer](#importer)(dbOptions, '/path/to/my/file', 'fancy_table_name');

imp.[import](#import)(function(err) {
	if(err) {
		console.log('Could not import file /path/to/my/file; Reason: '+err);
	}

	console.log('File /path/to/my/file successfully imported into database table fancy_table_name');
});

```

### <a name="interactive"></a>Interactive example
This example demonstrates how you can interactively add a file to the database. The Importer object can be constructed in the same way as in the previous example, but instead of immediately calling import, you can call a sniffing function iteratively, until you are happy with its result and then pass this result to the import function to finish the import process.

```
var Importer = require('monetdb-import')();

var dbOptions = {
	dbname: 'demo',
}

var imp = new [Importer](#importer)(dbOptions, '/path/to/my/file', 'fancy_table_name');

var sniffOptions = { /* Some optional initial sniffing options */ }
imp.[sniff](#sniff)(sniffOptions, function(err, sniffData) {
	if(err) throw new Error(err);

	// Investigate sniffData here...

	// If we decide that we are not happy with the sniff result, we can
	// just do another sniffing round with new options

	sniffOptions.delimiter = '\t'; // just an example

	imp.[sniff](#sniff)(sniffOptions, function(err, sniffData) {
		if(err) throw new Error(err);

		// Let's assume that we are happy with the sniffData now
		// We can then finish the import process
		imp.[import](#import)(sniffData, function(err) {
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
Constructor for an Importer object. 

- dbOptions [object]: In case you already have a database connection object in your code, you can add a property 'conn' to dbOptions (i.e. dbOptions = {conn: yourConnectionObject}). If the 'conn' property is found, all other properties will be ignored and we will assume the value of the 'conn' property is a valid, opened, MonetDBConnection object. In case this connection is not yet provided with a [q](https://www.npmjs.org/package/q) instance, we will do this for you.
In case the 'conn' property is missing, we will instantiate a MonetDBConnection object ourselves and we expect the dbOptions object to contain the properties needed to do so. These properties are given on the module page of the [monetdb module](https://www.npmjs.org/package/monetdb#connect).
- importOptions [object]: Optional object containing the following optional properties:
	- sampleSize [integer]: The maximum number of bytes to read from the import file for the sniffing process (default: 131072).
	- maxRecords [integer]: The maximum number of record arrays that will be stored in the [fileStats](#sniff) object(default: 10).
	- maxCharsInRecords [integer]: The maximum total number of characters that will be copied over to the records array (default: 2048).
	If the importOptions object is omitted entirely, all defaults will be assumed.
- filepath [string]: The path of the file that will be added to the database. Note that this import module only handles plain text files, no binaries.
- schemaname [string]: The name of the [schema](https://www.monetdb.org/Documentation/SQLreference/Schema) to which the file table will be added. Note that importing will fail if the schema does not exist. (default: sys).
- tablename [string]: The name of the table that will be created in [MonetDB](https://www.monetdb.org) to hold the contents of the given file. Note that importing will fail if the table already exists. 
- delimiters [array]: Array that represents a set of strings that are possible column delimiters. This
list of delimiters will be passed to the [csv-sniffer constructor](https://www.npmjs.org/package/csv-sniffer) (default: null)


#### <a name="sniff"></a>Importer.sniff([sniffOptions], fn):
This method allows you to use this module in an interactive way (see [interactive example](#interactive)).

- sniffOptions [object]: Optional object that will be passed on to the sniff method of the [csv-sniffer](https://www.npmjs.org/package/csv-sniffer) during importing. See the [csv-sniffer API](https://www.npmjs.org/package/csv-sniffer) for details on the possible options. If the sniffOptions are omitted or set to null, everything will be auto-detected by the CSV sniffer.
- fn [function]: Callback function that will be called whenever the sniffer completes. The first argument of this function is an error message or null on success. On success, the second argument contains an object with the following properties:
	- sniffResult [object]: The sniffResult as described in the [csv-sniffer API](https://www.npmjs.org/package/csv-sniffer)
	- fileStats [object]: An object containing statistics that were obtained using the given sniffResult. This object has the following properties:
		- labels [array]: Column labels for this file. If the first row of the import file was not used as column labels, this array was generated using the labeling function that can be provided using [Importer.setLabelFn](#setLabelFn). Otherwise, this array contains the labels as they occur in the first row of the file, after they have been transformed by [Importer.setLabelTransformFn](#setLabelTransformFn).
		- records [array]: Array containing an array for every row in the import file, with a maximum that can be provided in the [importOptions](#importer) object.
		- nrLines [integer]: Number of lines that are found in the file (equals number of newlines + 1).


#### <a name="import"></a>Importer.import([sniffData], [fn]):
This method does the actual import process.

- sniffData [object]: If this argument is not provided, the import method collects the sniff data itself by doing an internal call to [Importer.sniff](#sniff). If you do provide this argument, it should be an object as it results from a call to [Importer.sniff](#sniff), i.e. it must contain the sniffResult and fileStats properties.
- fn [function]: This callback function gets called when the import completes. If import failed, an error message will be provided as the first argument. On success, this argument will be set to null. If it is omitted or set to null, no one will be notified when the import completes.



### Advanced configuration
The default configuration will in most cases be sufficient. If it is not, you can use the following methods to have full control over the import process.

#### Importer.setParseOptions(parseOptions):
Once the [csv-sniffer](https://www.npmjs.org/package/csv-sniffer) is done sniffing your file, the file is parsed by the [csv-parse module](https://www.npmjs.org/package/csv-parse) to figure out more details about your file. We pass the following options object to the [csv-parse module](https://www.npmjs.org/package/csv-parse): 

```
var parseOptions = {
	delimiter: sniffResult.delimiter,
	rowDelimiter: sniffResult.newlineStr,
	quote: sniffResult.quoteChar,
	escape: '\\',
	comment: null,
	skip_empty_lines: true,
	auto_parse: false
}
```

Using Importer.setParseOptions, you can change this parseOptions object to something that fits your particular needs (although we have chosen these defaults that will work just fine in almost all cases). Immediately (and inevitably) after the sniffing process, these options will be extended with the 'delimiter', 'rowDelimiter', and 'quote' properties, which will be taken directly from the sniff result. Hence, you cannot control these properties in the parseOptions. If you want to influence them, you have to set these fields in the sniffOptions object that you can pass to the [Importer.sniff function](#sniff).


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

```
function labelTransformFn(label) {
	return label.toLowerCase()
			.replace(" ", "_")
			.replace("'", "")
			.replace('"', "")
			.replace("\t", "  ")
			.replace("\n", " | ")
			.replace("\r", "");
};
```


#### Importer.setSqlLogFn([fn]):

- fn [function]: Sets the SQL logging function called whenever this module executes a SQL query on your database. It receives a single argument: the SQL query that is executed. If omitted or set to null, queries will not be logged. Default function is console.log.


# Q Integration
For those of you who would like to interface with the monetdb-import module through using promises: we did you a solid. The asynchronous methods in the Importer object ([Importer.sniff](#sniff) and [Importer.import](#import)) have promise-returning variants: Importer.sniffQ and Importer.importQ.
