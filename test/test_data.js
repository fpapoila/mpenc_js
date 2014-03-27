/**
 * @fileOverview
 * Test data for use with all the tests.
 */

"use strict";

/*
 * Created: 4 March 2014 Guy K. Kloss <gk@mega.co.nz>
 *
 * (c) 2014 by Mega Limited, Wellsford, New Zealand
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

var _td = {};

// Attempt to patch the problem with running the code in PhantomJS.
//Uint8Array = Array;

/* Constants mainly for the mpenc.greet.cliques. */

_td.C25519_PRIV_KEY = 'bjsHiad/643YeCeLEjOowGBwUGx8k/beiJS76sHbBt0=';
_td.C25519_PRIV_KEY = atob(_td.C25519_PRIV_KEY);
_td.C25519_PUB_KEY  = 'apmKOMPxie1bZGNgUSoTlXxNh9+T7TSzO18YfqFRCU0=';
_td.C25519_PUB_KEY = atob(_td.C25519_PUB_KEY);
_td.COMP_KEY = 'YGhamvNw4vYjmU3aPhEwnPNWmfhSJP0D2XbU50YADws=';
_td.COMP_KEY = atob(_td.COMP_KEY);

/* Constants mainly for the mpenc.greet.ske. */

// eabuse@nexgo.de
_td.RSA_PRIV_KEY = [[75021949, 120245708, 82706226, 16596609, 37674797,
                     261009791, 126581637, 200709099, 258471049, 113825880,
                     88027939, 220319392, 131853044, 135390860, 267228055,
                     237315027, 211313164, 54839697, 207660246, 201155346,
                     227695973, 146596047, 142916215, 98103316, 179900092,
                     249054037, 220438057, 256596528, 241826839, 63322446,
                     251511068, 58364369, 170132212, 133096195, 124672185,
                     8312302, 35400], // p
                    [128226797, 41208503, 207045529, 258570880, 23478973,
                     77404621, 158690389, 238844389, 145903872, 246313677,
                     253728308, 119494952, 195555019, 267612530, 78611566,
                     243360854, 132826684, 262537884, 119597852, 182907181,
                     30678391, 79728624, 137983547, 32175673, 139438215,
                     13886352, 203417847, 31483577, 219866889, 247380166,
                     68669996, 160814481, 39019433, 201943306, 81626508,
                     139781605, 47731], // q
                    [4785377, 8492163, 46352361, 214103223, 128434713,
                     33319427, 227333660, 55393381, 166852858, 190311278,
                     266421688, 178197776, 225843133, 62575637, 239940639,
                     156855074, 46489535, 230003976, 165629060, 232780285,
                     27515958, 240399426, 29901886, 3564677, 236070629,
                     3087466, 157736667, 117145646, 146679490, 131447613,
                     67842827, 140689194, 34183581, 109932386, 16816523,
                     52507178, 201828114, 221386889, 93069099, 159021540,
                     167588690, 136091483, 163072457, 205020932, 49104348,
                     262271640, 121715911, 214191306, 218845664, 212719951,
                     35202357, 132089769, 260900202, 14401018, 60968598,
                     132321672, 121097206, 89837308, 236860238, 65524891,
                     197578617, 28474670, 158355089, 180828899, 133890556,
                     114831284, 151264265, 46682207, 133668594, 136278850,
                     182380943, 147467667, 29746422, 1], // d
                    [75355783, 190006521, 55791789, 26515137, 173264457,
                     47953225, 101795657, 248544110, 210747547, 144990768,
                     238334760, 1290057, 33076917, 143776635, 180658031,
                     5206380, 79345545, 256436153, 106840740, 206602733,
                     246803249, 78668765, 129583422, 246220806, 123434098,
                     186736925, 150630366, 220873360, 145726505, 256243347,
                     11221355, 188285031, 37371460, 220704442, 39001519,
                     9996194, 23543] // u = (1/q) mod p (required for CRT supported computation)
                   ];

_td.RSA_PUB_KEY = [[230365881, 209576468, 15544222, 146241808, 252079570,
                    169310559, 52361850, 127099922, 7697172, 6914372,
                    240866415, 186381438, 265008541, 131249274, 5412023,
                    116822512, 70709639, 10120711, 102602468, 92538077,
                    145862676, 246410806, 2951361, 150478827, 225416106,
                    12000579, 243955194, 57120583, 219135684, 250266055,
                    78274356, 121632765, 44944666, 242161807, 33156870,
                    87720642, 248990925, 1826913, 79999139, 185294179,
                    144362878, 144835676, 208249376, 88043460, 9822520,
                    144028681, 242331074, 229487397, 166383609, 221149721,
                    20523056, 32680809, 225735686, 260562744, 256010236,
                    123473411, 149346591, 61685654, 30737, 192350750,
                    135348825, 161356467, 2560651, 40433759, 132363757,
                    203318185, 51857802, 175054024, 131105969, 235375907,
                    138707159, 209300719, 79084575, 6], // n = p * q
                   [17], // e
                   2047]; // size

//// Generate RSA keys with openssl like this:
//// openssl genrsa -out key.pem 2048
//_td.RSA_PRIV_KEY = "-----BEGIN RSA PRIVATE KEY----- \n\
//MIIEpAIBAAKCAQEA8XZXByd+rLMjFAWLL26sLhlipEZc7Q0/tiSjPgqIM2GBR/Jr \n\
//...
//rnqoAEd+1qb436CoRW/wkrqb0ITrxGhutjIM3eeseKROYLjMVBA1hA== \n\
//-----END RSA PRIVATE KEY-----";
////Generate with
////openssl req -new -x509 -days 3650 -key key.pem -out foo.pem -subj "/"
//_td.RSA_CERT = "-----BEGIN CERTIFICATE----- \n\
//MIIC0zCCAbugAwIBAgIJALuqKJZVQaMPMA0GCSqGSIb3DQEBBQUAMAAwHhcNMTQw \n\
//...
//gO6eW97yAMvNXYOjUwf9nt9gIkqMeuXSQ31WLhHX4cWGOQyisJb9zaCcAiCneLfc \n\
//Gp+M557ppA== \n\
//-----END CERTIFICATE-----";
//_td.RSA_MODULUS = "F1765707277EACB32314058B2F6EAC2E1962A4465CED0D3FB624A33E0A8\
//...
//7F36EC4982FD15B4409D18C954F8F6B20083BFB30BFFF8BAFB5DCFEB7495F19";
//_td.RSA_EXPONENT = 0x10001;

_td.ED25519_PRIV_KEY = 'MTA4LDQ4LDIxMCwxNzAsMTM1LDU3LDIzMiwyMTUsMjE4LDEyMCwxMz'
                     + 'MsMTQwLDIyNywxODUsNDksMTk3LDE3OCw0MiwxMzYsMjM1LDg3LDE2'
                     + 'NywxODcsMjU1LDMsNSwxMTEsMTE2LDE1MSwyMjYsODksMTA2LDIwNC'
                     + 'wxMjksMjIzLDIwOSw1MCwxMjksMjUxLDEzNywyMjgsMjA4LDM2LDIx'
                     + 'OSwyMjMsMjA5LDI2LDIzNiwxODEsMTIxLDE4OSwyMDIsMjIzLDcxLD'
                     + 'UsNTYsMjI2LDI0Nyw0NywyMjcsMTU2LDE0MCwxNTMsMjIx';
_td.ED25519_PRIV_KEY = atob(_td.ED25519_PRIV_KEY);
_td.ED25519_PUB_KEY = 'VibpIVuhf+DPI/XGjpfpYu3XDsmQW3U9qwV5We+GBxI=';
_td.ED25519_PUB_KEY = atob(_td.ED25519_PUB_KEY);

_td.SIGNATURE = 'If+p7BIlEdrVV85fyRYY60zkHOvVD3Qv0Ja/vq2r++cOFKayj3tEIarWGFuWL'
              + '88eIUOBfGmjlqfD9wwXfkJox64/Vl75pRSaTj37zNVNVItYoOYe0o1TdogJNA'
              + 'yl4hCsBR78wMfMSi+kMFTEKAdA2ND1wxIV8VxcIz3qdYQ/s2jtEr+KM/xGryS'
              + 'bhlONCGNRXthmG1EyqEtdwvV8KWasrg3jRZov7H7+Y7jtnrUTPQ0xqxFCKygg'
              + 'mWmqsQUIQojje8OioQStT19Dtt3tyHF2OrHAbxxfvt8/Bh17oq3hvQMQQ6ITk'
              + 'v4ajUvnu7G81Uvloq5BUUhLp2NSmB18ExXhSg==';
_td.SIGNATURE = atob(_td.SIGNATURE);

_td.SESSION_ID = 'tmfwrDEJQq2dGb+yv1OVC6SIPOdqaEwju1J9++G/fJ8=';
_td.SESSION_ID = atob(_td.SESSION_ID);

_td.STATIC_PUB_KEY_DIR = {
    'get': function(key) { return _td.RSA_PUB_KEY; }
};

/* Constants mainly for the mpenc.codec and mpenc.greet.handler. */

_td.GROUP_KEY = atob('Fla5bB1SQ2itQ+XRUXGAVg==');
_td.UPFLOW_MESSAGE_STRING = atob('AAEAAQEBAAABMQEBAAEyAQIAAQABAwABMQEDAAEy'
                                 + 'AQMAATMBAwABNAEDAAE1AQMAATYBBAAAAQQAIG'
                                 + 'qZijjD8YntW2RjYFEqE5V8TYffk+00sztfGH6h'
                                 + 'UQlNAQUAIGqZijjD8YntW2RjYFEqE5V8TYffk+'
                                 + '00sztfGH6hUQlNAQYAIFYm6SFboX/gzyP1xo6X'
                                 + '6WLt1w7JkFt1PasFeVnvhgcSAQcAAA==');
_td.UPFLOW_MESSAGE_CONTENT = {
    source: '1',
    dest: '2',
    agreement: 'initial',
    flow: 'upflow',
    members: ['1', '2', '3', '4', '5', '6'],
    intKeys: [null, _td.C25519_PUB_KEY],
    nonces: [_td.C25519_PUB_KEY],
    pubKeys: [_td.ED25519_PUB_KEY],
    sessionSignature: null,
};
_td.UPFLOW_MESSAGE_WIRE = '?mpENC:' + btoa(_td.UPFLOW_MESSAGE_STRING) + '.';

_td.DATA_MESSAGE_STRING = atob('AAMAQBgeUZZlXeV7seFV0nrJ7y6xsp0XXVg/4DyIYn'
                               + 'p7h38Zpzzq6PMvNV/qXOl90U4/an2qu1sA2ZIR9Q'
                               + 'vAuwbjpggAAQABAQAEABCp6DcgfRj0yUpCHA7Nrr'
                               + 'Y8AAIAEJzvDvtbuEHIcICY5n3QEqI=');
_td.DATA_MESSAGE_WIRE = '?mpENC:' + btoa(_td.DATA_MESSAGE_STRING) + '.';
_td.DATA_MESSAGE_CONTENT = {
    signature: 'xxx',
    signatureOk: true,
    protocol: String.fromCharCode(0x01), // same as mpenc.VERSION
    iv: 'xxx',
    data: 'foo',
};
