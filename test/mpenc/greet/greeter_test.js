/**
 * @fileOverview
 * Test of the `mpenc/greet/greeter` module.
 */

/*
 * Created: 2 Mar 2015 Guy K. Kloss <gk@mega.co.nz>
 *
 * (c) 2014-2016 by Mega Limited, Auckland, New Zealand
 *     https://mega.nz/
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
    "mpenc/greet/greeter",
    "mpenc/helper/async",
    "mpenc/helper/utils",
    "mpenc/helper/struct",
    "mpenc/codec",
    "asmcrypto",
    "promise-polyfill",
    "megalogger",
    "chai",
    "sinon/assert",
    "sinon/sandbox",
    "sinon/spy",
    "sinon/stub",
], function(ns, async, utils, struct, codec, asmCrypto, Promise, MegaLogger,
            chai, sinon_assert, sinon_sandbox, sinon_spy, stub) {
    "use strict";

    var assert = chai.assert;
    var Set = struct.ImmutableSet;

    function _echo(x) {
        return x;
    }

    function makeGreeting(id, privKey, pubKey, staticPubKeyDir) {
        return new ns.Greeting({
            id: id,
            privKey: privKey,
            pubKey: pubKey,
            staticPubKeyDir: staticPubKeyDir,
        });
    };

    var doNothing = function() {};
    var dummyPubKeyDir = { get: function() { return _td.ED25519_PUB_KEY; } };
    var prevMem = "UNUSED"; // partialDecode doesn't do anything with prevMembers, just pass in a dummy value
    var fakePid = function() { return "fakePid"; };

    // Create/restore Sinon stub/spy/mock sandboxes.
    var sandbox = null;

    beforeEach(function() {
        sandbox = sinon_sandbox.create();
    });

    afterEach(function() {
        sandbox.restore();
    });

    describe("GreetMessage class", function() {
        describe("_readBit()", function() {
            it('downflow on INIT_PARTICIPANT_UP', function() {
                var message = new ns.GreetMessage();
                message.greetType = '\u0000\u001c', // INIT_PARTICIPANT_UP
                assert.strictEqual(message._readBit(ns._DOWN_BIT), false);
            });

            it('downflow on QUIT_DOWN', function() {
                var message = new ns.GreetMessage();
                message.greetType = '\u0000\u00d3'; // QUIT_DOWN
                assert.strictEqual(message._readBit(ns._DOWN_BIT), true);
            });
        });

        describe("_setBit()", function() {
            it('on valid transitions', function() {
                var message = new ns.GreetMessage();
                var tests = [[ns.GREET_TYPE.INIT_PARTICIPANT_UP, ns._DOWN_BIT, true],
                             [ns.GREET_TYPE.INIT_PARTICIPANT_DOWN, ns._DOWN_BIT, true],
                             [ns.GREET_TYPE.INIT_INITIATOR_UP, ns._INIT_BIT, false],
                             [ns.GREET_TYPE.INIT_PARTICIPANT_UP, ns._INIT_BIT, false]];
                var expected = [ns.GREET_TYPE.INIT_PARTICIPANT_DOWN,
                                ns.GREET_TYPE.INIT_PARTICIPANT_DOWN,
                                ns.GREET_TYPE.INIT_PARTICIPANT_UP,
                                ns.GREET_TYPE.INIT_PARTICIPANT_UP];
                for (var i in tests) {
                    message.greetType = tests[i][0];
                    var bit = tests[i][1];
                    var targetValue = tests[i][2];
                    message._setBit(bit, targetValue);
                    assert.strictEqual(message.greetType, expected[i]);
                }
            });

            it('on invalid transitions', function() {
                var message = new ns.GreetMessage();
                var tests = [[ns.GREET_TYPE.INIT_PARTICIPANT_DOWN, ns._DOWN_INIT, true],
                             [ns.GREET_TYPE.INIT_PARTICIPANT_CONFIRM_DOWN, ns._DOWN_BIT, false]];
                for (var i in tests) {
                    message.greetType = tests[i][0];
                    var bit = tests[i][1];
                    var targetValue = tests[i][2];
                    assert.throws(function() { message._setBit(bit, targetValue); },
                                  'Illegal message type!');
                }
            });

            it('on silenced invalid transitions', function() {
                sandbox.stub(MegaLogger.getLogger("greeter"), '_log');
                var message = new ns.GreetMessage();
                var tests = [[ns.GREET_TYPE.INIT_PARTICIPANT_DOWN, ns._DOWN_INIT, true],
                             [ns.GREET_TYPE.INIT_PARTICIPANT_CONFIRM_DOWN, ns._DOWN_BIT, false]];
                for (var i in tests) {
                    message.greetType = tests[i][0];
                    var bit = tests[i][1];
                    var targetValue = tests[i][2];
                    message._setBit(bit, targetValue, true);
                    assert.match(MegaLogger.getLogger("greeter")._log.getCall(i).args[1],
                                 /^Arrived at an illegal message type, but was told to ignore it:/);
                    assert.notStrictEqual(message.greetType, tests[i][0]);
                }
            });
        });

        describe("#clearGKA(), isGKA()", function() {
            it('on valid transitions', function() {
                var message = new ns.GreetMessage();
                var tests = [ns.GREET_TYPE.INIT_PARTICIPANT_DOWN,
                             ns.GREET_TYPE.INIT_PARTICIPANT_CONFIRM_DOWN];
                for (var i in tests) {
                    message.greetType = tests[i];
                    message.clearGKA();
                    assert.strictEqual(message.isGKA(), false);
                }
            });
        });
    });

    describe("greetTypeFromNumber() and greetTypeToNumber()", function() {
        var greetTypes = {
                            // Initial start sequence.
                            '\u0000\u009c': 0x09c, // INIT_INITIATOR_UP
                            '\u0000\u001c': 0x01c, // INIT_PARTICIPANT_UP
                            '\u0000\u001e': 0x01e, // INIT_PARTICIPANT_DOWN
                            '\u0000\u001a': 0x01a, // INIT_PARTICIPANT_CONFIRM_DOWN
                            // Include sequence.
                            '\u0000\u00ad': 0x0ad, // INCLUDE_AUX_INITIATOR_UP
                            '\u0000\u002d': 0x02d, // INCLUDE_AUX_PARTICIPANT_UP
                            '\u0000\u002f': 0x02f, // INCLUDE_AUX_PARTICIPANT_DOWN
                            '\u0000\u002b': 0x02b, // INCLUDE_AUX_PARTICIPANT_CONFIRM_DOWN
                            // Exclude sequence.
                            '\u0000\u00bf': 0x0bf, // EXCLUDE_AUX_INITIATOR_DOWN
                            '\u0000\u003b': 0x03b, // EXCLUDE_AUX_PARTICIPANT_CONFIRM_DOWN
                            // Refresh sequence.
                            '\u0000\u00c7': 0x0c7, // REFRESH_AUX_INITIATOR_DOWN
                            // Quit indication.
                            '\u0000\u00d3': 0x0d3  // QUIT_DOWN
        };
        var greetTypeNumbers = {};
        for (var msgType in greetTypes) {
            greetTypeNumbers[greetTypes[msgType]] = msgType;
        }

        it('greetTypeFromNumber()', function() {
            for (var number in greetTypeNumbers) {
                assert.strictEqual(ns.greetTypeFromNumber(number),
                                   greetTypeNumbers[number]);
            }
        });

        it('greetTypeToNumber()', function() {
            for (var type in greetTypes) {
                assert.strictEqual(ns.greetTypeToNumber(type),
                                   greetTypes[type]);
            }
        });

        it('round trip', function() {
            for (var type in greetTypes) {
                var number = ns.greetTypeToNumber(type);
                assert.strictEqual(ns.greetTypeFromNumber(number), type);
            }
        });
    });

    describe("encodeGreetMessage()", function() {
        it('upflow message', function() {
            sandbox.stub(codec, 'encodeTLV').returns('\u0000\u0000\u0000\u0000');
            var result = ns.encodeGreetMessage(_td.UPFLOW_MESSAGE_CONTENT,
                                                 _td.ED25519_PRIV_KEY,
                                                 _td.ED25519_PUB_KEY);
            assert.lengthOf(result, 66);
        });

        it('upflow message binary', function() {
            var result = ns.encodeGreetMessage(_td.UPFLOW_MESSAGE_CONTENT,
                                                 _td.ED25519_PRIV_KEY,
                                                 _td.ED25519_PUB_KEY);
            assert.strictEqual(btoa(result), btoa(_td.UPFLOW_MESSAGE_STRING));
        });

        it('downflow message for quit', function() {
            sandbox.stub(codec, 'encodeTLV').returns('\u0000\u0000\u0000\u0000');
            var result = ns.encodeGreetMessage(_td.DOWNFLOW_MESSAGE_CONTENT,
                                                 _td.ED25519_PRIV_KEY,
                                                 _td.ED25519_PUB_KEY);
            assert.lengthOf(result, 30);
        });

        it('downflow message for quit binary', function() {
            var result = ns.encodeGreetMessage(_td.DOWNFLOW_MESSAGE_CONTENT,
                                                 _td.ED25519_PRIV_KEY,
                                                 _td.ED25519_PUB_KEY);
            assert.strictEqual(result, _td.DOWNFLOW_MESSAGE_STRING);
        });

        it('null message', function() {
            assert.strictEqual(ns.encodeGreetMessage(null,
                               _td.ED25519_PRIV_KEY, _td.ED25519_PUB_KEY),
                               null);
            assert.strictEqual(ns.encodeGreetMessage(undefined,
                               _td.ED25519_PRIV_KEY, _td.ED25519_PUB_KEY),
                               null);
        });
    });

    describe("decodeGreetMessage()", function() {
        it('upflow message', function() {
            var result = ns.decodeGreetMessage(_td.UPFLOW_MESSAGE_STRING,
                                                 _td.ED25519_PUB_KEY);
            assert.strictEqual(result.source, _td.UPFLOW_MESSAGE_CONTENT.source);
            assert.strictEqual(result.dest, _td.UPFLOW_MESSAGE_CONTENT.dest);
            assert.strictEqual(result.greetType, _td.UPFLOW_MESSAGE_CONTENT.greetType);
            assert.deepEqual(result.members, _td.UPFLOW_MESSAGE_CONTENT.members);
            assert.deepEqual(result.intKeys, _td.UPFLOW_MESSAGE_CONTENT.intKeys);
            assert.deepEqual(result.nonces, _td.UPFLOW_MESSAGE_CONTENT.nonces);
            assert.deepEqual(result.pubKeys, _td.UPFLOW_MESSAGE_CONTENT.pubKeys);
            assert.strictEqual(result.sessionSignature, _td.UPFLOW_MESSAGE_CONTENT.sessionSignature);
        });

        it('upflow message, debug on', function() {
            sandbox.stub(MegaLogger.getLogger("greeter"), '_log');
            ns.decodeGreetMessage(_td.UPFLOW_MESSAGE_STRING,
                                    _td.ED25519_PUB_KEY);
            var log = MegaLogger.getLogger("greeter")._log.getCall(0).args;
            assert.deepEqual(log, [0, ['mpENC decoded message debug: ',
                                       ['messageSignature: FOZgJa4GtQwNsqvtR7y8qVrSUcjMn50ZK8E92oZFYU/1Y4LNTG191DUfpUugi6pE0m1iFam2CXNzIKStziNcBw==',
                                        'protocol: 1',
                                        'messageType: 0x2 (MPENC_GREET_MESSAGE)',
                                        'greetType: 0x9c (INIT_INITIATOR_UP)',
                                        'from: 1', 'to: 2',
                                        'member: 1', 'member: 2', 'member: 3', 'member: 4', 'member: 5', 'member: 6',
                                        'intKey: ', 'intKey: hSDwCYkwp1R0i33ctD73Wg2/Og0mOBr066SpjqqbTmo=',
                                        'nonce: hSDwCYkwp1R0i33ctD73Wg2/Og0mOBr066SpjqqbTmo=',
                                        'pubKey: 11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo=']]]);
        });

        it('downflow message for quit', function() {
            var result = ns.decodeGreetMessage(_td.DOWNFLOW_MESSAGE_STRING,
                                                 _td.ED25519_PUB_KEY);
            assert.strictEqual(result.source, _td.DOWNFLOW_MESSAGE_CONTENT.source);
            assert.strictEqual(result.dest, _td.DOWNFLOW_MESSAGE_CONTENT.dest);
            assert.strictEqual(result.greetType, _td.DOWNFLOW_MESSAGE_CONTENT.greetType);
            assert.strictEqual(result.signingKey, _td.DOWNFLOW_MESSAGE_CONTENT.signingKey);
        });

        it('wrong protocol version', function() {
            var message = _td.UPFLOW_MESSAGE_STRING.substring(68, 72)
                        + String.fromCharCode(77)
                        + _td.UPFLOW_MESSAGE_STRING.substring(73);
            assert.throws(function() { ns.decodeGreetMessage(message, _td.ED25519_PUB_KEY); },
                          'decode failed: expected PROTOCOL_VERSION');
        });
    });

    describe("Greeting class", function() {
        describe('constructor', function() {
            it('just make an instance', function() {
                var participant = makeGreeting('42',
                                                      _td.ED25519_PRIV_KEY,
                                                      _td.ED25519_PUB_KEY,
                                                      _td.STATIC_PUB_KEY_DIR);
                assert.strictEqual(participant.id, '42');
                assert.strictEqual(participant.privKey, _td.ED25519_PRIV_KEY);
                assert.strictEqual(participant.pubKey, _td.ED25519_PUB_KEY);
                assert.ok(participant.staticPubKeyDir.get('3'));
                assert.deepEqual(participant.askeMember.staticPrivKey, _td.ED25519_PRIV_KEY);
                assert.ok(participant.askeMember.staticPubKeyDir);
                assert.ok(participant.cliquesMember);
                assert.strictEqual(participant._opState, ns.STATE.NULL);
                assert.notOk(participant._finished);
            });
        });

        describe('#_mergeMessages() method', function() {
            it('fail for mismatching senders', function() {
                var participant = makeGreeting('1',
                                                      _td.ED25519_PRIV_KEY, _td.ED25519_PUB_KEY,
                                                      _td.STATIC_PUB_KEY_DIR);
                var cliquesMessage = { source: '1', dest: '2', agreement: 'ika', flow: 'up',
                                       members: ['1', '2', '3', '4', '5', '6'], intKeys: null };
                var askeMessage = { source: '2', dest: '2', flow: 'up',
                                    members: ['1', '2', '3', '4', '5', '6'],
                                    nonces: null, pubKeys: null, sessionSignature: null };
                assert.throws(function() { participant._mergeMessages(cliquesMessage, askeMessage); },
                              "Message source mismatch, this shouldn't happen.");
            });

            it('fail for mismatching receivers', function() {
                var participant = makeGreeting('1',
                                                      _td.ED25519_PRIV_KEY, _td.ED25519_PUB_KEY,
                                                      _td.STATIC_PUB_KEY_DIR);
                var cliquesMessage = { source: '1', dest: '2', agreement: 'ika', flow: 'up',
                                       members: ['1', '2', '3', '4', '5', '6'], intKeys: null };
                var askeMessage = { source: '1', dest: '', flow: 'up',
                                    members: ['1', '2', '3', '4', '5', '6'],
                                    nonces: null, pubKeys: null, sessionSignature: null };
                assert.throws(function() { participant._mergeMessages(cliquesMessage, askeMessage); },
                              "Message destination mismatch, this shouldn't happen.");
            });

            it('merge the messages', function() {
                var participant = makeGreeting('1',
                                                      _td.ED25519_PRIV_KEY, _td.ED25519_PUB_KEY,
                                                      _td.STATIC_PUB_KEY_DIR);
                var cliquesMessage = { source: '1', dest: '2', agreement: 'ika', flow: 'up',
                                       members: ['1', '2', '3', '4', '5', '6'], intKeys: null };
                var askeMessage = { source: '1', dest: '2', flow: 'up',
                                    members: ['1', '2', '3', '4', '5', '6'],
                                    nonces: null, pubKeys: null, sessionSignature: null };
                var message = participant._mergeMessages(cliquesMessage, askeMessage);
                assert.strictEqual(message.source, cliquesMessage.source);
                assert.strictEqual(message.dest, cliquesMessage.dest);
                assert.deepEqual(message.members, cliquesMessage.members);
                assert.deepEqual(message.intKeys, cliquesMessage.intKeys);
                assert.deepEqual(message.nonces, askeMessage.nonces);
                assert.deepEqual(message.pubKeys, askeMessage.pubKeys);
                assert.strictEqual(message.sessionSignature, askeMessage.sessionSignature);
            });

            it('merge the messages for ASKE only', function() {
                var participant = makeGreeting('1',
                                                      _td.ED25519_PRIV_KEY, _td.ED25519_PUB_KEY,
                                                      _td.STATIC_PUB_KEY_DIR);
                var askeMessage = { source: '3', dest: '', flow: 'down',
                                    members: ['1', '2', '3', '4', '5', '6'],
                                    nonces: null, pubKeys: null, sessionSignature: null,
                                    signingKey: null };
                var message = participant._mergeMessages(null, askeMessage);
                assert.strictEqual(message.source, '1');
                assert.strictEqual(message.dest, askeMessage.dest);
                assert.deepEqual(message.members, askeMessage.members);
                assert.deepEqual(message.intKeys, null);
                assert.deepEqual(message.nonces, askeMessage.nonces);
                assert.deepEqual(message.pubKeys, askeMessage.pubKeys);
                assert.strictEqual(message.sessionSignature, askeMessage.sessionSignature);
                assert.strictEqual(message.signingKey, null);
            });

            it('merge the messages for CLIQUES only', function() {
                var participant = makeGreeting('1',
                                                      _td.ED25519_PRIV_KEY, _td.ED25519_PUB_KEY,
                                                      _td.STATIC_PUB_KEY_DIR);
                var cliquesMessage = { source: '1', dest: '', agreement: 'aka', flow: 'down',
                                       members: ['1', '2', '3', '4', '5'], intKeys: null };
                var message = participant._mergeMessages(cliquesMessage, null);
                assert.strictEqual(message.source, '1');
                assert.strictEqual(message.dest, cliquesMessage.dest);
                assert.deepEqual(message.members, cliquesMessage.members);
                assert.deepEqual(message.intKeys, cliquesMessage.intKeys);
            });

            it('merge the messages for final case (no messages)', function() {
                var participant = makeGreeting('1',
                                                      _td.ED25519_PRIV_KEY, _td.ED25519_PUB_KEY,
                                                      _td.STATIC_PUB_KEY_DIR);
                var message = participant._mergeMessages(null, undefined);
                assert.strictEqual(message, null);
            });
        });

        describe('#_getCliquesMessage() method', function() {
            it('the vanilla ika case', function() {
                var message = {
                    source: '1',
                    dest: '2',
                    greetType: ns.GREET_TYPE.INIT_INITIATOR_UP,
                    members: ['1', '2', '3', '4', '5', '6'],
                    intKeys: null,
                    nonces: null,
                    pubKeys: null,
                    sessionSignature: null
                };

                var participant = makeGreeting('1',
                                                      _td.ED25519_PRIV_KEY, _td.ED25519_PUB_KEY,
                                                      _td.STATIC_PUB_KEY_DIR);
                var compare = { source: '1', dest: '2', agreement: 'ika', flow: 'up',
                                members: ['1', '2', '3', '4', '5', '6'], intKeys: [] };
                var cliquesMessage = participant._getCliquesMessage(
                        new ns.GreetMessage(message));
                assert.strictEqual(cliquesMessage.source, compare.source);
                assert.strictEqual(cliquesMessage.dest, compare.dest);
                assert.strictEqual(cliquesMessage.flow, compare.flow);
                assert.strictEqual(cliquesMessage.agreement, compare.agreement);
                assert.deepEqual(cliquesMessage.members, compare.members);
                assert.deepEqual(cliquesMessage.intKeys, compare.intKeys);
            });
        });

        describe('#_getAskeMessage() method', function() {
            it('the vanilla initial case', function() {
                var message = {
                    source: '1',
                    dest: '2',
                    greetType: ns.GREET_TYPE.INIT_INITIATOR_UP,
                    members: ['1', '2', '3', '4', '5', '6'],
                    intKeys: null,
                    nonces: null,
                    pubKeys: null,
                    sessionSignature: null,
                    signingKey: null,
                };

                var participant = makeGreeting('1',
                                                      _td.ED25519_PRIV_KEY, _td.ED25519_PUB_KEY,
                                                      _td.STATIC_PUB_KEY_DIR);
                var compare = { source: '1', dest: '2', flow: 'up',
                                members: ['1', '2', '3', '4', '5', '6'],
                                nonces: [], pubKeys: [], sessionSignature: null,
                                signingKey: null };
                var askeMessage = participant._getAskeMessage(
                        new ns.GreetMessage(message));
                assert.strictEqual(askeMessage.source, compare.source);
                assert.strictEqual(askeMessage.dest, compare.dest);
                assert.strictEqual(askeMessage.flow, compare.flow);
                assert.deepEqual(askeMessage.members, compare.members);
                assert.deepEqual(askeMessage.nonces, compare.nonces);
                assert.deepEqual(askeMessage.pubKeys, compare.pubKeys);
                assert.deepEqual(askeMessage.sessionSignature, compare.sessionSignature);
                assert.strictEqual(askeMessage.signingKey, compare.signingKey);
            });

            it('auxiliary downflow case for a quit', function() {
                var participant = makeGreeting('1',
                                                      _td.ED25519_PRIV_KEY, _td.ED25519_PUB_KEY,
                                                      _td.STATIC_PUB_KEY_DIR);
                var compare = { source: '1', dest: '', flow: 'down',
                                signingKey: _td.ED25519_PRIV_KEY };
                var askeMessage = participant._getAskeMessage(
                        new ns.GreetMessage(_td.DOWNFLOW_MESSAGE_CONTENT));
                assert.strictEqual(askeMessage.source, compare.source);
                assert.strictEqual(askeMessage.dest, compare.dest);
                assert.strictEqual(askeMessage.flow, compare.flow);
                assert.strictEqual(askeMessage.signingKey, compare.signingKey);
            });
        });

        describe('#start() method', function() {
            it('start/initiate a group session', function() {
                var participant = makeGreeting('1',
                                                      _td.ED25519_PRIV_KEY,
                                                      _td.ED25519_PUB_KEY,
                                                      _td.STATIC_PUB_KEY_DIR);
                sandbox.spy(participant.cliquesMember, 'ika');
                sandbox.spy(participant.askeMember, 'commit');
                sandbox.stub(ns, 'encodeGreetMessage', stub());
                sandbox.stub(participant, '_mergeMessages').returns(new ns.GreetMessage());
                var otherMembers = ['2', '3', '4', '5', '6'];
                var message = participant.start(otherMembers);
                assert(message);
                sinon_assert.calledOnce(participant.cliquesMember.ika);
                sinon_assert.calledOnce(participant.askeMember.commit);
                sinon_assert.calledOnce(participant._mergeMessages);
            });
        });

        describe('#include() method', function() {
            it('include empty member list', function() {
                var participant = makeGreeting('1',
                                                      _td.ED25519_PRIV_KEY,
                                                      _td.ED25519_PUB_KEY,
                                                      _td.STATIC_PUB_KEY_DIR);
                participant._opState = ns.STATE.READY;
                assert.throws(function() { participant.include([]); },
                              'No members to add.');
            });

            it('add members to group', function() {
                var participant = makeGreeting('1',
                                                      _td.ED25519_PRIV_KEY,
                                                      _td.ED25519_PUB_KEY,
                                                      _td.STATIC_PUB_KEY_DIR);
                participant.cliquesMember.akaJoin = sinon_spy();
                participant.askeMember.join = sinon_spy();
                participant._opState = ns.STATE.READY;
                sandbox.stub(ns, 'encodeGreetMessage', stub());
                sandbox.stub(participant, '_mergeMessages').returns(new ns.GreetMessage());
                var otherMembers = ['6', '7'];
                var message = participant.include(otherMembers);
                assert(message);
                sinon_assert.calledOnce(participant.cliquesMember.akaJoin);
                sinon_assert.calledOnce(participant.askeMember.join);
                sinon_assert.calledOnce(participant._mergeMessages);
            });
        });

        describe('#exclude() method', function() {
            it('exclude empty member list', function() {
                var participant = makeGreeting('3',
                                                      _td.ED25519_PRIV_KEY,
                                                      _td.ED25519_PUB_KEY,
                                                      _td.STATIC_PUB_KEY_DIR);
                participant._opState = ns.STATE.READY;
                assert.throws(function() { participant.exclude([]); },
                              'No members to exclude.');
            });

            it('exclude self', function() {
                var participant = makeGreeting('3',
                                                      _td.ED25519_PRIV_KEY,
                                                      _td.ED25519_PUB_KEY,
                                                      _td.STATIC_PUB_KEY_DIR);
                participant._opState = ns.STATE.READY;
                assert.throws(function() { participant.exclude(['3', '5']); },
                              'Cannot exclude mysefl.');
            });

            it('exclude members', function() {
                var participant = makeGreeting('3',
                                                      _td.ED25519_PRIV_KEY,
                                                      _td.ED25519_PUB_KEY,
                                                      _td.STATIC_PUB_KEY_DIR);
                participant.cliquesMember.akaExclude = sinon_spy();
                participant.askeMember.exclude = sinon_spy();
                participant._opState = ns.STATE.READY;
                sandbox.stub(ns, 'encodeGreetMessage', stub());
                sandbox.stub(participant, '_mergeMessages').returns(new ns.GreetMessage());
                var message = participant.exclude(['1', '4']);
                assert(message);
                sinon_assert.calledOnce(participant.cliquesMember.akaExclude);
                sinon_assert.calledOnce(participant.askeMember.exclude);
                sinon_assert.calledOnce(participant._mergeMessages);
            });
        });

        describe('#quit() method', function() {
            it('simple test', function() {
                var participant = makeGreeting('peter@genesis.co.uk/android4711',
                                                      _td.ED25519_PRIV_KEY,
                                                      _td.ED25519_PUB_KEY,
                                                      _td.STATIC_PUB_KEY_DIR);
                participant.askeMember.ephemeralPrivKey = _td.ED25519_PRIV_KEY;
                sandbox.spy(participant.askeMember, 'quit');
                sandbox.stub(ns, 'encodeGreetMessage', stub());
                sandbox.stub(participant.cliquesMember, 'akaQuit');
                sandbox.stub(participant, '_mergeMessages').returns(new ns.GreetMessage());
                var message = participant.quit();
                assert(message);
                sinon_assert.calledOnce(participant.askeMember.quit);
                sinon_assert.calledOnce(participant.cliquesMember.akaQuit);
                sinon_assert.calledOnce(participant._mergeMessages);
            });
        });

        describe('#refresh() method', function() {
            it('refresh own private key using aka', function() {
                var participant = makeGreeting('3',
                                                      _td.ED25519_PRIV_KEY,
                                                      _td.ED25519_PUB_KEY,
                                                      _td.STATIC_PUB_KEY_DIR);
                participant._mergeMessages = stub().returns(new ns.GreetMessage());
                participant.cliquesMember.akaRefresh = sinon_spy();
                sandbox.stub(ns, 'encodeGreetMessage', stub());
                participant._opState = ns.STATE.READY;
                var message = participant.refresh();
                assert(message);
                sinon_assert.calledOnce(participant.cliquesMember.akaRefresh);
                sinon_assert.calledOnce(participant._mergeMessages);
            });
        });

        describe('#_processMessage() method', function() {
            it('processing for an upflow message', function() {
                var message = { source: '1', dest: '2',
                                greetType: ns.GREET_TYPE.INIT_INITIATOR_UP,
                                members: ['1', '2', '3', '4', '5'],
                                intKeys: [null, ""],
                                nonces: ['foo'], pubKeys: ['foo'],
                                sessionSignature: null };
                var compare = { source: '2', dest: '3',
                                greetType: ns.GREET_TYPE.INIT_PARTICIPANT_UP,
                                members: ['1', '2', '3', '4', '5'],
                                intKeys: ["", "", ""],
                                nonces: ['foo', 'bar'], pubKeys: ['foo', 'bar'],
                                sessionSignature: null };
                var participant = makeGreeting('2',
                                                      _td.ED25519_PRIV_KEY,
                                                      _td.ED25519_PUB_KEY,
                                                      _td.STATIC_PUB_KEY_DIR);
                var result = participant._processMessage(new ns.GreetMessage(message));
                assert.strictEqual(result.newState, ns.STATE.INIT_UPFLOW);
                var output = result.decodedMessage;
                assert.strictEqual(output.source, compare.source);
                assert.strictEqual(output.dest, compare.dest);
                assert.strictEqual(output.greetType, compare.greetType);
                assert.deepEqual(output.members, compare.members);
                assert.lengthOf(output.intKeys, compare.intKeys.length);
                assert.lengthOf(output.nonces, compare.nonces.length);
                assert.lengthOf(output.pubKeys, compare.pubKeys.length);
                assert.strictEqual(output.sessionSignature, compare.sessionSignature);
            });

            it('processing for last upflow message', function() {
                var message = { source: '4', dest: '5',
                                greetType: ns.GREET_TYPE.INIT_PARTICIPANT_UP,
                                members: ['1', '2', '3', '4', '5'],
                                intKeys: ["", "", "", "", ""],
                                nonces: ['foo1', 'foo2', 'foo3', 'foo4'],
                                pubKeys: ['foo1', 'foo2', 'foo3', 'foo4'],
                                sessionSignature: null };
                var compare = { source: '5', dest: '',
                                greetType: ns.GREET_TYPE.INIT_PARTICIPANT_DOWN,
                                members: ['1', '2', '3', '4', '5'],
                                intKeys: ["", "", "", "", ""],
                                nonces: ['foo1', 'foo2', 'foo3', 'foo4', 'foo5'],
                                pubKeys: ['foo1', 'foo2', 'foo3', 'foo4', 'foo5'],
                                sessionSignature: 'bar' };
                var participant = makeGreeting('5',
                                                      _td.ED25519_PRIV_KEY,
                                                      _td.ED25519_PUB_KEY,
                                                      _td.STATIC_PUB_KEY_DIR);
                participant._opState = ns.STATE.NULL;
                var result = participant._processMessage(new ns.GreetMessage(message));
                assert.strictEqual(result.newState, ns.STATE.INIT_DOWNFLOW);
                var output = result.decodedMessage;
                assert.strictEqual(output.source, compare.source);
                assert.strictEqual(output.dest, compare.dest);
                assert.strictEqual(output.greetType, compare.greetType);
                assert.deepEqual(output.members, compare.members);
                assert.lengthOf(output.intKeys, compare.intKeys.length);
                assert.lengthOf(output.nonces, compare.nonces.length);
                assert.lengthOf(output.pubKeys, compare.pubKeys.length);
                assert.ok(output.sessionSignature);
            });

            it('processing for a downflow message', function() {
                var message = { source: '5', dest: '',
                                greetType: ns.GREET_TYPE.INIT_PARTICIPANT_DOWN,
                                members: ['1', '2', '3', '4', '5'],
                                intKeys: ["", "", "", "", ""],
                                nonces: ['foo1', 'foo2', 'foo3', 'foo4', 'foo5'],
                                pubKeys: ['foo1', 'foo2', 'foo3', 'foo4', 'foo5'],
                                sessionSignature: 'bar' };
                var participant = makeGreeting('2',
                                                      _td.ED25519_PRIV_KEY,
                                                      _td.ED25519_PUB_KEY,
                                                      _td.STATIC_PUB_KEY_DIR);
                participant._opState = ns.STATE.INIT_UPFLOW;
                participant.askeMember.members = message.members;
                sandbox.spy(participant.cliquesMember, 'upflow');
                sandbox.stub(participant.cliquesMember, 'downflow');
                sandbox.spy(participant.askeMember, 'upflow');
                sandbox.stub(participant.askeMember, 'downflow');
                sandbox.stub(participant, '_mergeMessages').returns(new ns.GreetMessage({dest: ''}));
                var result = participant._processMessage(new ns.GreetMessage(message));
                assert.strictEqual(result.newState, ns.STATE.INIT_DOWNFLOW);
                assert.strictEqual(participant.cliquesMember.upflow.callCount, 0);
                assert.strictEqual(participant.askeMember.upflow.callCount, 0);
                sinon_assert.calledOnce(participant.cliquesMember.downflow);
                sinon_assert.calledOnce(participant.askeMember.downflow);
                sinon_assert.calledOnce(participant._mergeMessages);
            });

            it('processing for a downflow message with invalid session auth', function() {
                var message = { source: '5', dest: '',
                                greetType: ns.GREET_TYPE.INIT_PARTICIPANT_DOWN,
                                members: ['1', '2', '3', '4', '5'],
                                intKeys: ["", "", "", "", ""],
                                nonces: ['foo1', 'foo2', 'foo3', 'foo4', 'foo5'],
                                pubKeys: ['foo1', 'foo2', 'foo3', 'foo4', 'foo5'],
                                sessionSignature: 'bar' };
                var participant = makeGreeting('2',
                                                      _td.ED25519_PRIV_KEY,
                                                      _td.ED25519_PUB_KEY,
                                                      _td.STATIC_PUB_KEY_DIR);
                participant.askeMember.ephemeralPrivKey = _td.ED25519_PRIV_KEY;
                participant.askeMember.ephemeralPubKey = _td.ED25519_PUB_KEY;
                participant._opState = ns.STATE.INIT_UPFLOW;
                sandbox.stub(participant.cliquesMember, 'downflow');
                sandbox.stub(participant.askeMember, 'downflow').throws(new Error('Session authentication by member 5 failed.'));
                sandbox.stub(participant, '_mergeMessages').returns(new ns.GreetMessage({ source: participant.id,
                                                                                             dest: '',
                                                                                             flow: 'down',
                                                                                             signingKey: _td.ED25519_PRIV_KEY }));
                assert.throws(function() { participant._processMessage(new ns.GreetMessage(message)); },
                              'Session authentication by member 5 failed.');
            });

            it('processing for a downflow message after CLIQUES finish', function() {
                var message = { source: '5', dest: '',
                                greetType: ns.GREET_TYPE.INIT_PARTICIPANT_CONFIRM_DOWN,
                                members: ['1', '2', '3', '4', '5'],
                                intKeys: [],
                                nonces: ['foo1', 'foo2', 'foo3', 'foo4', 'foo5'],
                                pubKeys: ['foo1', 'foo2', 'foo3', 'foo4', 'foo5'],
                                sessionSignature: 'bar' };
                var participant = makeGreeting('2',
                                                      _td.ED25519_PRIV_KEY,
                                                      _td.ED25519_PUB_KEY,
                                                      _td.STATIC_PUB_KEY_DIR);
                participant.askeMember.members = ['1', '2', '3', '4', '5'];
                participant.askeMember.ephemeralPubKeys = ['1', '2', '3', '4', '5'];
                participant._opState = ns.STATE.INIT_DOWNFLOW;
                participant.cliquesMember.groupKey = "bar";
                participant._recvOwnAuthMessage = true;
                sandbox.spy(participant.cliquesMember, 'upflow');
                sandbox.stub(participant.cliquesMember, 'downflow');
                sandbox.spy(participant.askeMember, 'upflow');
                sandbox.stub(participant.askeMember, 'downflow');
                sandbox.stub(participant, '_mergeMessages').returns(new ns.GreetMessage({dest: ''}));
                sandbox.stub(participant.askeMember, 'isSessionAcknowledged').returns(true);
                var result = participant._processMessage(new ns.GreetMessage(message));
                assert.strictEqual(result.newState, ns.STATE.READY);
                assert.strictEqual(participant.cliquesMember.upflow.callCount, 0);
                assert.strictEqual(participant.askeMember.upflow.callCount, 0);
                assert.strictEqual(participant.cliquesMember.downflow.callCount, 0);
                sinon_assert.calledOnce(participant._mergeMessages);
                sinon_assert.calledOnce(participant.askeMember.downflow);
                assert(participant.askeMember.isSessionAcknowledged.callCount > 0);
            });

            it('processing for a downflow message after a quit', function() {
                var participant = makeGreeting('2',
                                                      _td.ED25519_PRIV_KEY,
                                                      _td.ED25519_PUB_KEY,
                                                      _td.STATIC_PUB_KEY_DIR);
                participant._opState = ns.STATE.QUIT;
                var result = participant._processMessage(
                        new ns.GreetMessage(_td.DOWNFLOW_MESSAGE_CONTENT));
                assert.strictEqual(result, null);
                assert.strictEqual(participant._opState, ns.STATE.QUIT);
            });

            it('processing for a downflow without me in it', function() {
                var participant = makeGreeting('2',
                                                      _td.ED25519_PRIV_KEY,
                                                      _td.ED25519_PUB_KEY,
                                                      _td.STATIC_PUB_KEY_DIR);
                var message = { source: '1', dest: '',
                                greetType: ns.GREET_TYPE.EXCLUDE_AUX_INITIATOR_DOWN,
                                members: ['1', '3', '4', '5'] };
                participant._opState = ns.STATE.READY;
                var result = participant._processMessage(
                        new ns.GreetMessage(message));
                assert.deepEqual(result,
                                 { decodedMessage: null, newState: ns.STATE.QUIT });
            });

            it('processing for an upflow message not for me', function() {
                var participant = makeGreeting('2',
                                                      _td.ED25519_PRIV_KEY,
                                                      _td.ED25519_PUB_KEY,
                                                      _td.STATIC_PUB_KEY_DIR);
                var message = { source: '3', dest: '4',
                                greetType: ns.GREET_TYPE.INIT_PARTICIPANT_UP,
                                members: ['1', '3', '2', '4', '5'] };
                participant._opState = ns.STATE.INIT_UPFLOW;
                var result = participant._processMessage(
                        new ns.GreetMessage(message));
                assert.strictEqual(result.decodedMessage, null);
                assert.strictEqual(result.newState, null);
            });

            it('processing for a downflow from me', function() {
                var participant = makeGreeting('1',
                                                      _td.ED25519_PRIV_KEY,
                                                      _td.ED25519_PUB_KEY,
                                                      _td.STATIC_PUB_KEY_DIR);
                var message = { source: '1', dest: '',
                                greetType: ns.GREET_TYPE.EXCLUDE_AUX_INITIATOR_DOWN,
                                members: ['1', '3', '4', '5'] };
                participant._opState = ns.STATE.AUX_DOWNFLOW;
                participant.askeMember.members = message.members;
                var result = participant._processMessage(new ns.GreetMessage(message));
                assert.strictEqual(result.decodedMessage, null);
                assert.strictEqual(result.newState, null);
            });
        });
    });

    describe("Greeter Class", function() {
        var stubPartialDecodeInternals = function(interceptDecode) {
            var popStub = function(rest, type, action) {
                var r = interceptDecode(type);
                if (r !== undefined) { action(r); }
                return rest;
            };
            sandbox.stub(codec, "popTLV", popStub);
            sandbox.stub(codec, "popTLVMaybe", popStub);
            sandbox.stub(codec, "decodeWirePacket").returns({
                type : codec.MESSAGE_TYPE.MPENC_GREET_MESSAGE,
                content : ""
            });
        };

        it("Test _determineFlowType correct data", function() {
            var owner = '1';
            var initOldMembers = new Set(['1']);
            var initNewMembers = new Set(['1', '2', '3']);
            var oldMembers = new Set(['1', '2', '3']);
            var excludeNewMembers = new Set(['1', '2']);
            var joinNewMembers = new Set(['1', '2', '3', '4']);
            //var quitNewMembers = new Set(['2', '3']);
            var refreshNewMembers = new Set(['1', '2', '3']);

            var greetInit = ns._determineFlowType(owner, initOldMembers, initNewMembers);
            var greetExclude = ns._determineFlowType(owner, oldMembers, excludeNewMembers);
            var greetJoin = ns._determineFlowType(owner, oldMembers, joinNewMembers);
            //var greetQuit = ns._determineFlowType(owner, oldMembers, quitNewMembers);
            var greetRefresh = ns._determineFlowType(owner, oldMembers, refreshNewMembers);

            assert.strictEqual(greetInit.greetType, ns.GREET_TYPE.INIT_INITIATOR_UP,
                "Expected include, got " + ns.GREET_TYPE_MAPPING[greetInit.greetType]);
            assert.deepEqual(greetInit.members.toArray(), ['2', '3']);
            assert.strictEqual(greetExclude.greetType, ns.GREET_TYPE.EXCLUDE_AUX_INITIATOR_DOWN,
                "Expected exclude, got " + ns.GREET_TYPE_MAPPING[greetExclude.greetType]);
            assert.deepEqual(greetExclude.members.toArray(), ['3'], "Exclude members not correct.");
            assert.strictEqual(greetJoin.greetType, ns.GREET_TYPE.INCLUDE_AUX_INITIATOR_UP,
                "Expected join, got " + ns.GREET_TYPE_MAPPING[greetJoin.greetType]);
            assert.deepEqual(greetJoin.members.toArray(), ['4'], "Join members not correct.");
            //assert.strictEqual(greetQuit.greetType, ns.GREET_TYPE.QUIT_DOWN,
            //    "Expected quit, got " + ns.GREET_TYPE_MAPPING[greetQuit.greetType]);
            //assert.deepEqual(greetQuit.members.toArray(), ['1']);
            assert.strictEqual(greetRefresh.greetType, ns.GREET_TYPE.REFRESH_AUX_INITIATOR_DOWN,
                "Expected refresh, got " + ns.GREET_TYPE_MAPPING[greetRefresh.greetType]);
            assert.deepEqual(greetRefresh.members.toArray(), ['2', '3']);
        });

        it("Test _determineFlowType incorrect data", function() {
            var owner = '1';
            var oldMembers = new Set(['1', '2', '3']);
            var newIncorrectMembers = new Set(['1', '2', '4']);

            assert.throws(function() { ns._determineFlowType(owner, oldMembers, newIncorrectMembers);},
                    "Cannot both exclude and join members.", "_determineFlowType not throwing on" +
                        " both exclude and include members.");
        });

        it("Test get GreetingSummary from partialDecode.", function() {
            var acceptedTypes = [
                ns.GREET_TYPE.INIT_INITIATOR_UP,
                ns.GREET_TYPE.INCLUDE_AUX_INITIATOR_UP,
                ns.GREET_TYPE.EXCLUDE_AUX_INITIATOR_DOWN,
                ns.GREET_TYPE.REFRESH_AUX_INITIATOR_DOWN,
            ];

            var t, decodeMembers;
            stubPartialDecodeInternals(function(type) {
                switch (type) {
                case codec.TLV_TYPE.GREET_TYPE: return t;
                case codec.TLV_TYPE.SOURCE: return "1";
                case codec.TLV_TYPE.CHAIN_HASH: return utils.sha256("dummyHash");
                case codec.TLV_TYPE.PREV_PF: return utils.sha256("dummyPrevPf");
                case codec.TLV_TYPE.LATEST_PM: return utils.sha256("dummyParent");
                case codec.TLV_TYPE.MEMBER: return decodeMembers.shift();
                }
            });

            sandbox.stub(ns, '_makePacketHash').returns(null);
            var channelMembers = new Set(["1", "2"]);
            for (var x = 0; x < acceptedTypes.length; x++) {
                t = acceptedTypes[x];
                decodeMembers = channelMembers.toArray();
                var gtr = new ns.Greeter("1", _td.ED25519_PRIV_KEY, _td.ED25519_PUB_KEY, dummyPubKeyDir);
                var greetSummary = gtr.partialDecode(prevMem, "random message", "1", fakePid);
                assert.ok(greetSummary, "Failed to accept on: " + ns.GREET_TYPE_MAPPING[t]);
            }
        });

        it("Test return null from partialDecode.", function() {
            var acceptedTypes = [
                ns.GREET_TYPE.INIT_PARTICIPANT_DOWN,
                ns.GREET_TYPE.INCLUDE_AUX_PARTICIPANT_DOWN,
                ns.GREET_TYPE.EXCLUDE_AUX_INITIATOR_DOWN
            ];

            var t, decodeMembers;
            stubPartialDecodeInternals(function(type) {
                switch (type) {
                case codec.TLV_TYPE.GREET_TYPE: return t;
                case codec.TLV_TYPE.SOURCE: return "1";
                case codec.TLV_TYPE.MEMBER: return decodeMembers.shift();
                }
            });

            var channelMembers = new Set(["1", "2"]);
            for (var x = 0; x < acceptedTypes.length; x++) {
                t = acceptedTypes[x];
                decodeMembers = channelMembers.toArray();
                var gtr = new ns.Greeter("1", _td.ED25519_PRIV_KEY, _td.ED25519_PUB_KEY, dummyPubKeyDir);
                var greetSummary = gtr.partialDecode(prevMem, "random message", "1", fakePid);
                assert.notOk(greetSummary, "Failed to reject on: " + ns.GREET_TYPE_MAPPING[t]);
            }
        });

        it("Test final message, no current greeting", function() {
            stubPartialDecodeInternals(function(type) {
                switch (type) {
                case codec.TLV_TYPE.GREET_TYPE: return ns.GREET_TYPE.INIT_PARTICIPANT_CONFIRM_DOWN;
                case codec.TLV_TYPE.SOURCE: return "1";
                }
            });
            var gtr = new ns.Greeter("2", _td.ED25519_PRIV_KEY, _td.ED25519_PUB_KEY, dummyPubKeyDir);
            assert.strictEqual(gtr.partialDecode(prevMem, "random message", "1", fakePid), null);

        });

        it("Test final message tested, correct", function() {
            stubPartialDecodeInternals(function(type) {
                switch (type) {
                case codec.TLV_TYPE.GREET_TYPE: return ns.GREET_TYPE.INIT_PARTICIPANT_CONFIRM_DOWN;
                case codec.TLV_TYPE.SOURCE: return "2";
                }
            });
            var prevPi = utils.sha256("randomMessage");
            var gtr = new ns.Greeter("1", _td.ED25519_PRIV_KEY, _td.ED25519_PUB_KEY, dummyPubKeyDir);
            var dummyGreeting = new ns.Greeting(gtr);
            dummyGreeting.askeMember.yetToAuthenticate = function() { return ["2"]; };
            dummyGreeting._recvOwnAuthMessage = true;
            gtr.currentPi = prevPi;
            gtr.currentGreeting = dummyGreeting;
            var summary = gtr.partialDecode(prevMem, "random message", "2", fakePid);
            assert.ok(summary);
            assert.notOk(summary.metadata);
            assert.strictEqual(summary.prevPi, prevPi);
        });

        it("Test final message tested, incorrect", function() {
            stubPartialDecodeInternals(function(type) {
                switch (type) {
                case codec.TLV_TYPE.GREET_TYPE: return ns.GREET_TYPE.INIT_PARTICIPANT_CONFIRM_DOWN;
                case codec.TLV_TYPE.SOURCE: return "2";
                }
            });
            var gtr = new ns.Greeter("1", _td.ED25519_PRIV_KEY, _td.ED25519_PUB_KEY, dummyPubKeyDir);
            var dummyGreeting = new ns.Greeting(gtr);
            dummyGreeting.askeMember.yetToAuthenticate = function() { return ["3"]; };
            dummyGreeting._recvOwnAuthMessage = true;
            gtr.currentGreeting = dummyGreeting;
            assert.deepEqual(
                gtr.partialDecode(prevMem, "random message", "2", fakePid), null,
                "Final received message is not from expected source.");
        });

        it("Test saving of greeter", function() {
            var prevPf = "prevPf";
            var chainHash = "chainHash";
            var parents = [utils.sha256("parents")];
            var metadata = ns.GreetingMetadata.create(prevPf, chainHash, "1", parents);
            var gtr = new ns.Greeter("1", _td.ED25519_PRIV_KEY, _td.ED25519_PUB_KEY, dummyPubKeyDir);

            var dummyGreetStore = {
                _opState : ns.STATE.NULL
            };
            var dummyMessage = { source: '3', dest: '4',
                greetType: ns.GREET_TYPE.INIT_PARTICIPANT_UP,
                members: ['1', '3', '2', '4', '5'],
                metadata: null };
            var dummyGreeting = { id : "1", onSend : doNothing,
                start : function(value) { return dummyMessage; },
                getEphemeralPrivKey : function() { return _td.ED25519_PRIV_KEY; },
                getEphemeralPubKey : function() { return _td.ED25519_PUB_KEY; },
                getPromise : function() { return new Promise(function(){}); } };

            var channelMembers = new Set(["1", "2", "3"]);
            var initMembers = new Set(["1"]);
            var nextMembers = channelMembers;
            var pubtxt = gtr.encode(dummyGreetStore, initMembers, nextMembers, metadata);
            assert.ok(pubtxt);

            gtr.proposedGreeting = dummyGreeting;
            var decMessage = codec.decodeWirePacket(pubtxt);
            assert.strictEqual(gtr.proposalHash, ns._makePacketHash(decMessage.content));
            var retGreeting = gtr.decode(dummyGreetStore, prevMem, pubtxt, "1", "fakePid");
            assert.deepEqual(dummyGreeting, retGreeting);
        });

        it("Encode->partial decode proposal message", function() {
            var prevPf = "prevPf";
            var chainHash = "chainHash";
            var parents = [utils.sha256("parents")];
            var metadata = ns.GreetingMetadata.create(prevPf, chainHash, "1", parents);
            var gtr = new ns.Greeter("1", _td.ED25519_PRIV_KEY, _td.ED25519_PUB_KEY, dummyPubKeyDir);
            var dummyGreetStore = {
                _opState : ns.STATE.NULL
            };

            var channelMembers = new Set(["1", "2", "3"]);
            var initMembers = new Set(["1"]);
            var nextMembers = channelMembers;
            var pubtxt = gtr.encode(dummyGreetStore, initMembers, nextMembers, metadata);
            assert.ok(pubtxt, "pubtxt not ok.");
            var m = gtr.partialDecode(prevMem, pubtxt, "1", fakePid);
            assert.ok(m, "message not ok.");
            assert.strictEqual(m.metadata.prevCh, "chainHash", "chainHash not equal");
            assert.strictEqual(m.metadata.prevPf, "prevPf");
            assert.strictEqual(m.metadata.author, "1");
            assert.deepEqual(m.metadata.parents.toArray(), parents);

        });

        it("Encode->decode proposal message", function() {
            var prevPf = utils.sha256("prevPf");
            var chainHash = utils.sha256("chainHash");
            var parents = [utils.sha256("parents")];
            var id = "1";
            var metadata = ns.GreetingMetadata.create(prevPf, chainHash, id, parents);
            var gtr = new ns.Greeter("1", _td.ED25519_PRIV_KEY, _td.ED25519_PUB_KEY, dummyPubKeyDir);
            var dummyGreetStore = {
                _opState : ns.STATE.NULL
            };

            var channelMembers = new Set(["1", "2", "3"]);
            var initMembers = new Set(["1"]);
            var nextMembers = channelMembers;
            var pubtxt = gtr.encode(dummyGreetStore, initMembers, nextMembers, metadata);
            assert.ok(pubtxt, "pubtxt not ok.");

            // Check the message with the other user.
            var gtrTwo = new ns.Greeter("2", _td.ED25519_PRIV_KEY, _td.ED25519_PUB_KEY, dummyPubKeyDir);
            var m = gtrTwo.partialDecode(prevMem, pubtxt, "1", fakePid);
            assert.ok(m, "message not ok.");
            assert.strictEqual(m.metadata.prevCh, chainHash, "chainHash not equal.");
            assert.strictEqual(m.metadata.prevPf, prevPf, "prevPf not equal.");
            assert.strictEqual(m.metadata.author, id, "author not equal.");
            assert.deepEqual(m.metadata.parents.toArray(), parents, "parents not equal.");
            var dummyGreetStoreTwo = {
                _opState : ns.STATE.NULL
            };

            var nGreeting = gtrTwo.decode(dummyGreetStoreTwo, prevMem, pubtxt, "1", "fakePid");
            var dest;
            nGreeting.onSend(function(send_out) { dest = send_out.recipients; return true; });
            var status = nGreeting.recv({ pubtxt: pubtxt, sender: "1" });
            assert.ok(status);
            assert.ok(nGreeting, "nGreeting is null.");
            assert.ok(nGreeting.askeMember.members, "askeMember.members is null.");
            assert.strictEqual(nGreeting._opState, ns.STATE.INIT_UPFLOW, "state is not equal.");
            assert.deepEqual(nGreeting.askeMember.members, ["1", "2", "3"], "Members are not equal.");
            //assert.strictEqual(nGreeting.metadataIsAuthenticated(), true, "metadata is not authenticated.");
            assert.deepEqual(dest.toArray(), ["3"], "Destination not correct.");

            // Check the message with ourselves.Save a backup to ensure it is ours.
            var savedGreeting = gtr.proposedGreeting;
            var ourGreeting = gtr.decode(dummyGreetStore, prevMem, pubtxt, "1", "fakePid");
            assert.ok(ourGreeting);
            assert.deepEqual(ourGreeting, savedGreeting);
        });
    });

    describe("Multiple Greeter instances with complete operation flows", function() {
        var maybeExtractNextPf = function(summaries, targetMembers, nextPf) {
            // check if the summaries represent a final packet. if so, it must
            // be identified correctly in the same way by all the target members.
            var targetSummaries = [];
            summaries.forEach(function(summary, id) {
                if (targetMembers.has(id)) {
                    targetSummaries.push(summary);
                }
            });
            var allIsFinal = targetSummaries.every(function(s) { return s && s.prevPi !== null; });
            if (!allIsFinal) { return undefined; }
            var values = new Set(targetSummaries.map(function(s) { return s.prevPi; }));
            assert.strictEqual(1, values.size, "got different values for prevPi");
            assert.strictEqual(nextPf, undefined, "nextPf set twice");
            return values.values().next().value;
        };

        var initOutput = {
            prevPf: utils.sha256("dummyPrevPF"),
            states: { get: function() { return null; } },
            members: null,
        };

        var runGreetings = function(greeters, initId, channelMembers,
                prevOutput, nextMembers, packetInterceptHook, expectFailure) {
            var prevPf = prevOutput.prevPf;
            var prevStates = prevOutput.states;
            var prevMembers = prevOutput.members;

            packetInterceptHook = packetInterceptHook || function() {};
            var expectSuccess = !expectFailure;
            var affectedMembers = prevMembers ? nextMembers.union(prevMembers) : nextMembers;
            affectedMembers.forEach(function(id) {
                assert.ok(greeters.has(id), "Greeter not present for id " + id);
            });
            // as per our assumptions of the abstract GKA (see msg-notes Appendix 5),
            // everyone can identify a failed operation, but only relevant members
            // can identify a successful operation.
            var targetMembers = (expectSuccess) ? nextMembers : affectedMembers;

            var pubtxt0 = greeters.get(initId).encode(
                prevStates.get(initId), prevMembers, nextMembers,
                ns.GreetingMetadata.create(
                    prevPf, utils.sha256("chainHash"), initId, []));

            var promises = [];
            var resultStates = new Map();
            var sendQueue = [];
            var greetings = new Map();
            var nextPf;

            var summaries = new Map();
            // Start the operation
            greeters.forEach(function(greeter, id) {
                if (!affectedMembers.has(id)) { return; }
                assert.strictEqual(greeter.id, id, "greeter id mismatch");
                var summary = greeter.partialDecode(
                    prevMembers, pubtxt0, initId, utils.sha256.bind(null, pubtxt0));
                assert.strictEqual(summary.metadata.prevPf, prevPf, "metadata prevPf mismatch");
                summaries.set(id, summary);
                var greeting = greeter.decode(
                    prevStates.get(id), prevMembers, pubtxt0, initId, utils.sha256(pubtxt0));
                assert.notOk(greeting._finished, "greeting somehow fulfilled before due");
                assert.strictEqual(greeting.id, id, "greeting id mismatch");
                greetings.set(id, greeting);
                greeting.onSend(function(send_out) {
                    var pubtxt = send_out.pubtxt;
                    var recipients = send_out.recipients;
                    assert.deepEqual(recipients.subtract(channelMembers).size, 0,
                        "recipients not all in channel");
                    sendQueue.push({ pubtxt: pubtxt, sender: id });
                });
                var status = greeting.recv({ pubtxt: pubtxt0, sender: initId });
                assert.deepEqual(greeting.getNextMembers().toArray(), nextMembers.toArray(),
                    "result members mismatch");
                assert.ok(status, "initial packet not accepted by receive handler");
            });
            affectedMembers.forEach(function(id) {
                assert.ok(greetings.has(id), "Greeting not created for id " + id);
            });

            nextPf = maybeExtractNextPf(summaries, targetMembers, nextPf);
            // nextPf is a "sentinel" to say when we should stop. if it's not set, then try
            // the packet intercept hook, which could also set it.
            nextPf = nextPf || packetInterceptHook(greetings, sendQueue);
            if (nextPf) {
                assert.strictEqual(0, sendQueue.length);
            }

            // While there's pending sends, keep delivering them
            while (sendQueue.length) {
                var recv_in = sendQueue.shift();
                var pubtxt = recv_in.pubtxt;
                var sender = recv_in.sender;
                // try partial decode
                var summaries = new Map();
                greeters.forEach(function(greeter, id) {
                    if (!affectedMembers.has(id)) { return; }
                    var summary = greeter.partialDecode(
                        prevMembers, pubtxt, sender, utils.sha256.bind(null, pubtxt));
                    summaries.set(id, summary);
                    var status = greetings.get(id).recv(recv_in);
                    if (nextPf && targetMembers.has(id)) {
                        assert.ok(status, "medial/final packet not accepted by receive handler");
                    }
                });
                // if this is a final packet that was identified the same way by all target members
                // otherwise, everyone must identify it as non-initial/non-final
                nextPf = maybeExtractNextPf(summaries, targetMembers, nextPf);
                if (!nextPf) {
                    var allIsNull = struct.iteratorToArray(summaries.values()).every(
                        function(v) { return v === null; });
                    assert.ok(allIsNull, "members got different results for partialDecode: ");
                }
                // same deal with the "sentinel" as before.
                nextPf = nextPf || packetInterceptHook(greetings, sendQueue);
                if (nextPf) {
                    assert.strictEqual(0, sendQueue.length);
                }
            }

            // Check result state
            greetings.forEach(function(greeting, id) {
                if (!targetMembers.has(id)) {
                    if (targetMembers.size > 1) {
                        assert.notOk(greeting._finished, "old member finished greeting not for them");
                    } else {
                        assert.ok(greeting._finished, "old member did not finish 1-member greeting to exclude them");
                    }
                    return;
                }
                if (expectSuccess) {
                    assert.ok(greeting.getResultState(), "greeting did not complete");
                    assert.strictEqual(greeting._finished, 1, "_finished flag not complete");
                    resultStates.set(id, greeting.getResultState());
                } else {
                    assert.throws(greeting.getResultState.bind(greeting), "OperationFailed");
                    assert.strictEqual(greeting._finished, -1, "_finished flag not failed");
                }
                promises.push(greeting.getPromise());
                assert.deepEqual(greeting.getNextMembers().toArray(), nextMembers.toArray(),
                    "result members mismatch");
            });
            assert.strictEqual(targetMembers.size, promises.length);
            assert.ok(nextPf, "nextPf was not calculated");
            if (expectSuccess) {
                return Promise.all(promises).then(function(greetings) {
                    return {
                        prevPf: nextPf,
                        states: resultStates,
                        members: nextMembers,
                    };
                });
            } else {
                return Promise.all(promises.map(async.reversePromise)).then(function(reasons) {
                    return {
                        prevPf: nextPf,
                        states: prevStates,
                        members: prevMembers,
                        rejected: reasons,
                    };
                });
            }
        };

        var makeNewGreeter = function(id) {
            return new ns.Greeter(id, _td.ED25519_PRIV_KEY, _td.ED25519_PUB_KEY, dummyPubKeyDir);
        };

        it("for 3 members, 2 joining, 2 others leaving, refresh key", function(done) {
            this.timeout(this.timeout() * 30);
            var greeters = new Map();
            var setNewGreeter = function(id) { greeters.set(id, makeNewGreeter(id)); };

            Promise.resolve(initOutput).then(function(prev) {
                // join
                var channelMembers = new Set(["0", "1", "2"]);
                channelMembers.forEach(setNewGreeter);
                var members1 = channelMembers;
                return runGreetings(greeters, "0", channelMembers, prev, members1);
            }).then(function(prev) {
                // include
                var includeMembers = new Set(["3", "4"]);
                includeMembers.forEach(setNewGreeter);
                var channelMembers = prev.members.union(includeMembers);
                var members2 = channelMembers;
                return runGreetings(greeters, "1", channelMembers, prev, members2);
            }).then(function(prev) {
                // exclude
                var channelMembers = prev.members;
                var excludeMembers = new Set(["1", "3"]);
                var members3 = channelMembers.subtract(excludeMembers);
                return runGreetings(greeters, "2", channelMembers, prev, members3);
            }).then(function(prev) {
                // refresh
                var channelMembers = prev.members;
                var members4 = prev.members;
                return runGreetings(greeters, "4", channelMembers, prev, members4);
            }).then(function(prev) {
                done();
            }).catch(console.log);
        });

        it("exclude all except self", function(done) {
            this.timeout(this.timeout() * 15);
            var greeters = new Map();
            var setNewGreeter = function(id) { greeters.set(id, makeNewGreeter(id)); };

            Promise.resolve(initOutput).then(function(prev) {
                // join
                var channelMembers = new Set(["0", "1", "2"]);
                channelMembers.forEach(setNewGreeter);
                var members1 = channelMembers;
                return runGreetings(greeters, "0", channelMembers, prev, members1);
            }).then(function(prev) {
                // exclude, 1 person left
                var channelMembers = prev.members;
                var excludeMembers = new Set(["1", "2"]);
                var members3 = channelMembers.subtract(excludeMembers);
                return runGreetings(greeters, "0", channelMembers, prev, members3);
            }).then(function(prev) {
                done();
            }).catch(console.log);
        });

        it("simple fail start", function(done) {
            this.timeout(this.timeout() * 15);
            var greeters = new Map();
            var setNewGreeter = function(id) { greeters.set(id, makeNewGreeter(id)); };

            Promise.resolve(initOutput).then(function(prev) {
                var channelMembers = new Set(["0", "1", "2"]);
                channelMembers.forEach(setNewGreeter);
                var members1 = channelMembers;
                return runGreetings(greeters, "0", channelMembers, prev, members1, function(greetings, sendQueue) {
                    greetings.forEach(function(greeting, id) {
                        greeting.fail(new Error("test expected failure"));
                    });
                    sendQueue.splice(0, sendQueue.length);
                    // with an external fail(), nextPf is also calculated externally
                    // outside of partialDecode
                    return "dummyPrevPf";
                }, true);
            }).then(function(prev) {
                assert.strictEqual(prev.rejected.length, 3);
                done();
            }).catch(console.log);
        });

    });

});
