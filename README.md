wisebed.js-scripts
==================

A set of experimentation scripts and a command line interface (CLI) for wisebed.js.

"[wisebed.js](http://github.com/wisebed/wisebed.js) is a JavaScript-based client library that builds upon the REST API defined for the newest version of the WISEBED backend system [Testbed Runtime](http://github.com/itm/testbed-runtime). It uses HTTP requests/responses for most management operations and the WebSocket for communication with the sensor nodes serial port. wisebed.js-scripts is a collection of command-line scripts built upon wisebed.js, offering the same (and a bit more) functionality than the well-known but nowadays technically outdated [experimentation-scripts](http://github.com/wisebed/experimentation-scripts)." ([wisebed.eu](http://wisebed.eu/site/conduct-experiments/testbeds/uzl/))

## Installation

Install [node.js](http://nodejs.org/) first, then:

```
git clone https://github.com/wisebed/wisebed.js-scripts.git
cd wisebed.js-scripts
npm install
alias wb=./wb.js
```

## Usage

wisebed.js-scripts are (aim to be) self-explaining. Just run:

```
wb --help
```

which will give you a list of options and commands to choose from.
If you want more help for a specific command run:

```
wb COMMAND_NAME --help
```

## Getting started

### Create configuration file

List and detailed information about all [WISEBED testbeds](http://wisebed.eu/site/conduct-experiments/testbeds/).

#### UzL1 testbed

Further information: [Testbed University of Lübeck (UZL)](http://wisebed.eu/site/conduct-experiments/testbeds/uzl/)

1. [Register for an account](http://portal.wisebed.itm.uni-luebeck.de/user_registration/)

2. Add the file `local_uzl1.json`

```
{
  "rest_api_base_url"  : "http://portal.wisebed.itm.uni-luebeck.de/rest/v1.0",
  "websocket_base_url" : "ws://portal.wisebed.itm.uni-luebeck.de/ws/v1.0",
  "credentials"        : [
    {
      "urnPrefix" : "urn:wisebed:uzl1:",
      "username"  : "YOUR_USERNAME_HERE",
      "password"  : "YOUR_PASSWORD_HERE"
    }
  ]
}
```

Run commands with the configuration file by using `-c` or `--config`

```
wb COMMAND_NAME -c local_uzl1.json
```

### Reserve nodes

Show all nodes
```
wb nodes -c local_uzl1.json
```

Reserve the node (`-n`) `urn:wisebed:uzl1:0xAAAA` (choose for AAAA a ID, shown by the previous command) for the duration (`-d`) of 5 minutes
```
wb make-reservation -c local_uzl1.json -n "urn:wisebed:uzl1:0xAAAA" -d "00:05"
```