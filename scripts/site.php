<?php
require_once("xml2json/xml2json.php");
error_reporting(E_ALL ^ E_WARNING);

// Read the filename from the command line.
$testXmlFile = '../xml/site.xml';

//Read the XML contents from the input file.
file_exists($testXmlFile) or die('Could not find file ' . $testXmlFile);
$xmlStringContents = file_get_contents($testXmlFile); 
$jsonContents = "";

// Convert it to JSON now. 
// xml2json simply takes a String containing XML contents as input.
$jsonContents = xml2json::transformXmlStringToJson($xmlStringContents);

echo($jsonContents);
?>