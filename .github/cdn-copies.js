// Standalone reproduction of the CDN copies that build/release.js
// (`makeReleaseCopies`) writes into dist/cdn during a jQuery release.
// The npm tarball ships dist/cdn, but the release task lives behind the
// jquery-release tool, so run this directly before packing.
var fs = require( "fs" ),

	version = require( "../package.json" ).version,

	devFile = "dist/jquery.js",
	minFile = "dist/jquery.min.js",
	mapFile = "dist/jquery.min.map",

	cdnFolder = "dist/cdn",

	releaseFiles = {
		"jquery-VER.js": devFile,
		"jquery-VER.min.js": minFile,
		"jquery-VER.min.map": mapFile,
		"jquery.js": devFile,
		"jquery.min.js": minFile,
		"jquery.min.map": mapFile,
		"jquery-latest.js": devFile,
		"jquery-latest.min.js": minFile,
		"jquery-latest.min.map": mapFile
	};

if ( !fs.existsSync( cdnFolder ) ) {
	fs.mkdirSync( cdnFolder );
}

Object.keys( releaseFiles ).forEach(function( key ) {
	var text,
		builtFile = releaseFiles[ key ],
		unpathedFile = key.replace( /VER/g, version ),
		releaseFile = cdnFolder + "/" + unpathedFile;

	if ( /\.map$/.test( releaseFile ) ) {
		// Map files need to reference the new uncompressed name;
		// assume that all files reside in the same directory.
		text = fs.readFileSync( builtFile, "utf8" )
			.replace( /"file":"([^"]+)","sources":\["([^"]+)"\]/,
				"\"file\":\"" + unpathedFile.replace( /\.min\.map/, ".min.js" ) +
				"\",\"sources\":[\"" + unpathedFile.replace( /\.min\.map/, ".js" ) + "\"]" );
		fs.writeFileSync( releaseFile, text );
	} else if ( /\.min\.js$/.test( releaseFile ) ) {
		// Remove the source map comment; it causes way too many problems.
		text = fs.readFileSync( builtFile, "utf8" )
			.replace( /\/\/# sourceMappingURL=\S+/, "" );
		fs.writeFileSync( releaseFile, text );
	} else if ( builtFile !== releaseFile ) {
		fs.writeFileSync( releaseFile, fs.readFileSync( builtFile ) );
	}

	console.log( "File '" + releaseFile + "' created." );
});
