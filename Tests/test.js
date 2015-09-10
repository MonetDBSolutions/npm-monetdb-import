var should = require("should");
var Importer = require("../index.js")();

var dbOptions = {};
var tablename = "importedfile";

describe("Importer#Importer", function() {
	it("Should fail on non-existing file", function() {
		(function() { return new Importer(dbOptions, "/non/existing/file", tablename); })
			.should.throw(Error);
	});

	it("Should fail on binary file", function() {
		(function() { return new Importer(dbOptions, __dirname + "/cameras.zip", tablename); })
			.should.throw(Error);
	});

	it("Should not fail on proper csv file", function() {
		(function() { return new Importer(dbOptions, __dirname + "/cameras.csv", tablename); })
			.should.not.throw(Error);
	});
});
