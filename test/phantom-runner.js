/*
 * Headless QUnit runner for the jQuery 1.11.x test suite (QUnit 1.x API).
 *
 * Usage:
 *   phantomjs test/phantom-runner.js [url]
 *
 * Defaults to http://127.0.0.1:8000/test/index.html
 *
 * Exits 0 when every assertion passed, 1 on any failure, timeout or load error.
 */
/*jshint evil:true */
/*global phantom:false, require:false, console:false */

"use strict";

var system = require( "system" ),
	page = require( "webpage" ).create(),

	url = system.args[ 1 ] || "http://127.0.0.1:8000/test/index.html",

	// Hard ceiling for the whole run.
	HARD_TIMEOUT_MS = 10 * 60 * 1000,
	// Bail out if QUnit stops emitting events for this long.
	STALL_TIMEOUT_MS = 2 * 60 * 1000,

	DEBUG = !!system.env.QUNIT_DEBUG,

	failures = [],
	moduleStats = {},
	moduleOrder = [],
	testsRun = 0,
	summary = null,
	finished = false,
	lastActivity = Date.now(),
	startedAt = Date.now();

function log( msg ) {
	console.log( msg );
}

function moduleBucket( name ) {
	var key = name || "(no module)";
	if ( !moduleStats[ key ] ) {
		moduleStats[ key ] = { passed: 0, failed: 0, total: 0, tests: 0, failedTests: {} };
		moduleOrder.push( key );
	}
	return moduleStats[ key ];
}

function finish( code, reason ) {
	if ( finished ) {
		return;
	}
	finished = true;

	if ( reason ) {
		log( "" );
		log( "!! " + reason );
	}

	log( "" );
	log( "================ PER-MODULE BREAKDOWN ================" );

	var i, key, bucket, names;
	for ( i = 0; i < moduleOrder.length; i++ ) {
		key = moduleOrder[ i ];
		bucket = moduleStats[ key ];
		names = [];
		for ( var t in bucket.failedTests ) {
			if ( bucket.failedTests.hasOwnProperty( t ) ) {
				names.push( t );
			}
		}
		log(
			( bucket.failed > 0 ? "FAIL  " : "ok    " ) +
			key + ": " + bucket.passed + " passed, " + bucket.failed + " failed, " +
			bucket.total + " assertions across " + bucket.tests + " tests" +
			( names.length ? " [failing tests: " + names.join( "; " ) + "]" : "" )
		);
	}

	log( "======================================================" );
	log( "Modules: " + moduleOrder.length + ", tests run: " + testsRun +
		", wall clock: " + Math.round( ( Date.now() - startedAt ) / 1000 ) + "s" );

	if ( summary ) {
		log( "TOTAL: " + summary.passed + " passed, " + summary.failed + " failed, " +
			summary.total + " assertions" );
	} else {
		log( "TOTAL: 0 passed, 0 failed, 0 assertions (run did not complete)" );
	}

	phantom.exit( code );
}

/*
 * Injected before any page script runs. QUnit is not defined yet at this point,
 * so poll for it and attach the 1.x logging callbacks as soon as it appears.
 * Everything crossing callPhantom must be plain JSON, hence the in-page
 * stringification of actual/expected (they are frequently DOM nodes or
 * circular structures in the jQuery suite).
 */
page.onInitialized = function() {
	page.evaluate( function() {
		var attached = false;

		function dump( value ) {
			try {
				if ( window.QUnit && window.QUnit.jsDump && window.QUnit.jsDump.parse ) {
					return String( window.QUnit.jsDump.parse( value ) ).slice( 0, 800 );
				}
				return String( value ).slice( 0, 800 );
			} catch ( e ) {
				return "<unserializable: " + ( e && e.message ) + ">";
			}
		}

		function attach() {
			var QUnit = window.QUnit;
			if ( attached || !QUnit || !QUnit.log || !QUnit.done ) {
				return;
			}
			attached = true;

			QUnit.log( function( d ) {
				// Only ship failures across the bridge; passes are counted via testDone.
				if ( d.result ) {
					return;
				}
				window.callPhantom({
					type: "assertion",
					module: d.module,
					name: d.name,
					message: d.message,
					expected: dump( d.expected ),
					actual: dump( d.actual ),
					source: d.source ? String( d.source ).slice( 0, 500 ) : ""
				});
			});

			QUnit.testDone( function( d ) {
				window.callPhantom({
					type: "testDone",
					module: d.module,
					name: d.name,
					failed: d.failed,
					passed: d.passed,
					total: d.total,
					runtime: d.runtime
				});
			});

			QUnit.moduleDone( function( d ) {
				window.callPhantom({
					type: "moduleDone",
					name: d.name,
					failed: d.failed,
					passed: d.passed,
					total: d.total
				});
			});

			QUnit.done( function( d ) {
				window.callPhantom({
					type: "done",
					failed: d.failed,
					passed: d.passed,
					total: d.total,
					runtime: d.runtime
				});
			});
		}

		attach();
		var poll = setInterval( function() {
			attach();
			if ( attached ) {
				clearInterval( poll );
			}
		}, 10 );
	});
};

page.onCallback = function( data ) {
	if ( !data || finished ) {
		return;
	}
	lastActivity = Date.now();

	var bucket;

	if ( data.type === "assertion" ) {
		failures.push( data );
		bucket = moduleBucket( data.module );
		bucket.failedTests[ data.name ] = true;
		log( "FAIL [" + ( data.module || "(no module)" ) + "] " + data.name );
		log( "      message : " + ( data.message || "(no message)" ) );
		log( "      expected: " + data.expected );
		log( "      actual  : " + data.actual );
		if ( data.source ) {
			log( "      source  : " + data.source.split( "\n" )[ 0 ] );
		}
		return;
	}

	if ( data.type === "testDone" ) {
		testsRun++;
		bucket = moduleBucket( data.module );
		bucket.passed += data.passed;
		bucket.failed += data.failed;
		bucket.total += data.total;
		bucket.tests++;
		if ( DEBUG ) {
			log( "  . " + ( data.module || "(no module)" ) + ": " + data.name +
				" (" + data.passed + "/" + data.total + ")" );
		}
		return;
	}

	if ( data.type === "moduleDone" ) {
		log( "-- module done: " + ( data.name || "(no module)" ) +
			" -> " + data.passed + " passed, " + data.failed + " failed, " +
			data.total + " assertions" );
		return;
	}

	if ( data.type === "done" ) {
		summary = data;
		log( "" );
		log( "QUnit reported completion in " + data.runtime + "ms" );
		// Give any trailing log events a tick to drain.
		setTimeout( function() {
			finish( data.failed > 0 ? 1 : 0, null );
		}, 250 );
	}
};

page.onConsoleMessage = function( msg ) {
	if ( DEBUG ) {
		log( "[console] " + msg );
	}
};

page.onError = function( msg, trace ) {
	// QUnit installs its own window.onerror and converts these into failed
	// assertions, so surface them without failing the run here.
	if ( DEBUG ) {
		log( "[pageerror] " + msg );
		( trace || [] ).forEach( function( t ) {
			log( "            " + t.file + ":" + t.line );
		});
	}
};

page.onResourceError = function( err ) {
	if ( DEBUG ) {
		log( "[resource-error] " + err.url + " -> " + err.errorString );
	}
};

log( "Loading " + url );

page.open( url, function( status ) {
	if ( status !== "success" ) {
		log( "Unable to load " + url + " (status: " + status + ")" );
		finish( 1, "page load failed" );
	} else {
		log( "Page loaded, waiting for QUnit..." );
	}
});

setInterval( function() {
	if ( finished ) {
		return;
	}
	if ( Date.now() - startedAt > HARD_TIMEOUT_MS ) {
		finish( 1, "HARD TIMEOUT after " + ( HARD_TIMEOUT_MS / 1000 ) +
			"s - QUnit never signalled done." );
	} else if ( Date.now() - lastActivity > STALL_TIMEOUT_MS ) {
		finish( 1, "STALLED - no QUnit events for " + ( STALL_TIMEOUT_MS / 1000 ) +
			"s (last completed test count: " + testsRun + ")." );
	}
}, 1000 );
