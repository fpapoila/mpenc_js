/**
 * @fileOverview
 * Tests for `mpenc/helper/async` module.
 */

/*
 * Created: 30 Mar 2015 Ximin Luo <xl@mega.co.nz>
 *
 * (c) 2015 by Mega Limited, Auckland, New Zealand
 *     http://mega.co.nz/
 *
 * This file is part of the multi-party chat encryption suite.
 *
 * This code is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License version 3
 * as published by the Free Software Foundation. See the accompanying
 * LICENSE file or <https://www.gnu.org/licenses/> if it is unavailable.
 *
 * This code is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 */

define([
    "mpenc/helper/async",
    "chai",
], function(ns, chai) {
    "use strict";

    var assert = chai.assert;

    var logs = null;
    var cancel_sub = null;
    var assertLog = function(x) { assert.strictEqual(logs.shift(), x); }

    var oldTimer = ns.defaultMsTimer;
    // For some reason, web standards don't guarantee that in
    //   setTimeout(f, x); setTimeout(g, y);
    // where y >= x, that g runs strictly after f.
    // So we do this stupid hack that "approximates" this behaviour, to make
    // our tests a bit easier to write.
    ns.defaultMsTimer = function(ticks, action) { return oldTimer(ticks*10, action); };

    beforeEach(function() {
        logs = [];
        cancel_sub = ns.SubscriberFailure.subscribeGlobal(function(item) { logs.push(item); });
    });

    afterEach(function() {
        cancel_sub();
        assert.deepEqual(logs, []);
        logs = null;
    });

    describe("Observable", function() {
        var cb_x = function(i) {
            logs.push("called x: " + i);
        };

        var cb_y = function(i) {
            logs.push("called y: " + i);
        };

        describe("reentry mode", function() {
            var fail_y = function(i) {
                logs.push("called y: " + i);
                throw new Error("help y");
            };

            var cb_z = function(obs, cancel_ref, i) {
                cancel_ref[0]();
                obs.subscribe(fail_y);
                logs.push("called z: " + i);
            };

            var cancel_x_ref = [undefined];

            it("cancel later subscriber", function() {
                var prep = function(i) {
                    var obs = new ns.Observable();
                    obs.subscribe(cb_x);
                    obs.subscribe(function(i) { return cb_z(obs, cancel_x_ref, i); });
                    cancel_x_ref[0] = obs.subscribe(cb_x);
                    obs.publish(i);
                    return obs;
                };

                var obs = prep(1);
                assertLog("called x: 1");
                assertLog("called z: 1");
                assert.deepEqual(logs, []);

                obs.publish(2);
                assertLog("called x: 2");
                assertLog("called z: 2");
                assertLog("called y: 2");
                assert(logs.shift() instanceof ns.SubscriberFailure);
                assert.deepEqual(logs, []);
            });

            it("cancel earler subscriber", function() {
                var prep = function(i) {
                    var obs = new ns.Observable();
                    cancel_x_ref[0] = obs.subscribe(cb_x);
                    obs.subscribe(function(i) { return cb_z(obs, cancel_x_ref, i); });
                    obs.subscribe(cb_x);
                    obs.publish(i);
                    return obs;
                };

                var obs = prep(1);
                assertLog("called x: 1");
                assertLog("called z: 1");
                assertLog("called x: 1");
                assert.deepEqual(logs, []);

                obs.publish(2);
                assertLog("called z: 2");
                assertLog("called x: 2");
                assertLog("called y: 2");
                assert(logs.shift() instanceof ns.SubscriberFailure);
                assert.deepEqual(logs, []);
            });
        });

        it("subscribe once", function() {
            var obs = new ns.Observable();
            obs.subscribe(cb_x);
            obs.subscribe(cb_y);
            obs.subscribe.once(cb_x);
            obs.subscribe(cb_y);
            obs.subscribe(cb_x);

            obs.publish(1);
            assertLog("called x: 1");
            assertLog("called y: 1");
            assertLog("called x: 1");
            assertLog("called y: 1");
            assertLog("called x: 1");
            assert.deepEqual(logs, []);

            obs.publish(2);
            assertLog("called x: 2");
            assertLog("called y: 2");
            assertLog("called y: 2");
            assertLog("called x: 2");
            assert.deepEqual(logs, []);
        });

        it("cancel multiple", function() {
            var obs = new ns.Observable();
            var cancels = [];
            cancels.push(obs.subscribe(cb_x));
            cancels.push(obs.subscribe(cb_y));
            cancels.push(obs.subscribe.once(cb_x));
            cancels.push(obs.subscribe(cb_y));
            cancels.push(obs.subscribe(cb_x));

            obs.publish(1);
            assertLog("called x: 1");
            assertLog("called y: 1");
            assertLog("called x: 1");
            assertLog("called y: 1");
            assertLog("called x: 1");
            assert.deepEqual(logs, []);

            var cancelAll = ns.combinedCancel(cancels);
            assert(cancelAll());
            obs.publish(2);
            obs.publish(3);
            assert.deepEqual(logs, []);
            assert(!cancelAll());
            obs.publish(3);
            obs.publish(4);
            assert.deepEqual(logs, []);
        })
    });

    describe("timer", function() {
        describe("defaultMsTimer", function() {
            it("oneTimeoutOrder", function(done) {
                var timer = ns.defaultMsTimer;
                timer(2, function() { logs.push("cb1"); });
                timer(1, function() { logs.push("cb0"); });
                timer(2, function() { logs.push("cb2"); });
                // wait a bit longer because browsers do delay clamping
                timer(10, function() {
                    assertLog("cb0");
                    assertLog("cb1");
                    assertLog("cb2");
                    assert.deepEqual(logs, []);
                    done();
                });
            });

            it("oneTimeoutOrderAdd", function(done) {
                var timer = ns.defaultMsTimer;
                timer(2, function() { logs.push("cb1"); });
                timer(1, function() {
                    logs.push("cb0");
                    timer(1, function() { logs.push("cb2"); });
                });
                // wait a bit longer because browsers do delay clamping
                timer(15, function() {
                    assertLog("cb0");
                    assertLog("cb1");
                    assertLog("cb2");
                    assert.deepEqual(logs, []);
                    done();
                });
            });
        });

        describe("subscribe timeout", function() {
            var timer = ns.defaultMsTimer;

            var cb_x = function() {
                logs.push("called x");
            };
            var fail_x = function() {
                logs.push("timeout x");
            };

            it("default, no allowFireLater", function(done) {
                var obs = new ns.Observable();
                var cancel_x = obs.subscribe.withBackup(timer.bind(null, 1), fail_x)(cb_x);
                timer(20, function() {
                    assertLog("timeout x");
                    assert.deepEqual(logs, []);
                    obs.publish(1);
                    assert(!cancel_x());
                    assert.deepEqual(logs, []);
                    done();
                });
            });

            it("allowFireLater", function(done) {
                var obs = new ns.Observable();
                var cancel_x = obs.subscribe.withBackup(timer.bind(null, 1), fail_x, true)(cb_x);
                timer(5, function() {
                    obs.publish(1);
                });
                timer(20, function() {
                    assertLog("timeout x");
                    assertLog("called x");
                    assert.deepEqual(logs, []);
                    assert(cancel_x());
                    done();
                });
            });
        });
    });

    describe("Monitor", function() {
        var timer = ns.defaultMsTimer;

        it("basic usage", function(done) {
            var called = 0
            var times = 3;
            var act = function() {
                logs.push("called act-basic");
                called += 1;
                if (called >= times) {
                    return true;
                }
            };
            var mon = new ns.Monitor(timer, 1, act);
            assert(mon.state() == "RUNNING");
            mon.pause();
            assert.throws(mon.pause.bind(mon));
            assert(mon.state() == "PAUSED");
            mon.resume();
            assert.throws(mon.resume.bind(mon));
            timer(50, function() {
                assert.equal(called, 3);
                assertLog("called act-basic");
                assertLog("called act-basic");
                assertLog("called act-basic");
                assert(mon.state() == "STOPPED");
                mon.stop();
                assert(mon.state() == "STOPPED");
                assert.throws(mon.pause.bind(mon));
                assert.throws(mon.resume.bind(mon));
                done();
            });
        });

        it("fail SubscriberFailure", function(done) {
            var called = 0
            var times = 1;
            var act = function() {
                logs.push("called act-sf");
                called += 1;
                if (called >= times) {
                    throw new Error("fail action");
                }
            };
            var mon = new ns.Monitor(timer, 1, act);
            timer(20, function() {
                assert.equal(called, 1);
                assertLog("called act-sf");
                assert(logs.shift() instanceof ns.SubscriberFailure);
                done();
            });
        });

        it("finite seq", function(done) {
            var act = function() {
                logs.push("called act-fs");
            };
            var mon = new ns.Monitor(timer, [1, 1, 1, 1], act);
            timer(2, function() { logs.push("called middle"); });
            assert(mon.state() == "RUNNING");
            timer(50, function() {
                assertLog("called act-fs");
                assertLog("called middle"); // not sure if ordering is part of JS spec
                // but this works on phantomJS/firefox/chrome. if it fails elsewhere, we'll need to be less strict
                assertLog("called act-fs");
                assertLog("called act-fs");
                assertLog("called act-fs");
                assert(mon.state() == "STOPPED");
                done();
            });
        });

        it("reset", function(done) {
            var act = function() {
                logs.push("called act-reset");
            };
            var mon = new ns.Monitor(timer, [1, 1], act);
            assert(mon.state() == "RUNNING");
            timer(30, function() {
                assertLog("called act-reset");
                assertLog("called act-reset");
                assert(mon.state() == "STOPPED");
                assert.deepEqual(logs, []);
                mon.reset([1, 1, 1]);
                timer(40, function() {
                    assertLog("called act-reset");
                    assertLog("called act-reset");
                    assertLog("called act-reset");
                    assert(mon.state() == "STOPPED");
                    done();
                });
            });
        });
    });

    // polyfill for PhantomJS
    if (!Function.prototype.bind) {
      Function.prototype.bind = function(oThis) {
        if (typeof this !== 'function') {
          // closest thing possible to the ECMAScript 5
          // internal IsCallable function
          throw new TypeError('Function.prototype.bind - what is trying to be bound is not callable');
        }

        var aArgs   = Array.prototype.slice.call(arguments, 1),
            fToBind = this,
            fNOP    = function() {},
            fBound  = function() {
              return fToBind.apply(this instanceof fNOP
                     ? this
                     : oThis,
                     aArgs.concat(Array.prototype.slice.call(arguments)));
            };

        fNOP.prototype = this.prototype;
        fBound.prototype = new fNOP();

        return fBound;
      };
    }

});