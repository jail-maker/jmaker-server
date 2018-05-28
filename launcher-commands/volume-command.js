'use strict';

const { spawnSync } = require('child_process');
const { ensureDir } = require('fs-extra');
const path = require('path');
const sha256 = require('js-sha256').sha256;
const uuidv5 = require("uuid/v5");
const config = require('../libs/config');
const logsPool = require('../libs/logs-pool');
const Layers = require('../libs/layers');
const chains = require('../libs/layers/chains');
const mountNullfs = require('../libs/mount-nullfs');
const umount = require('../libs/umount');
const CommandInterface = require('../libs/command-interface');

class VolumeCommand extends CommandInterface {

    constructor(receiver) {

        super();
        this._receiver = receiver;
        this._mountPath = null;

    }

    _normalizeArgs(args = {}) {

        const template = {
            name: undefined,
            path: undefined,
        };

        if (typeof(args) === 'string') 
            args = { path: args };

        return Object.assign(template, args);

    }

    async exec() {

        let {
            layer,
            manifest,
            args = {},
            recorder,
        } = this._receiver;

        let layers = new Layers(config.imagesLocation);
        let volumes = new Layers(config.volumesLocation);
        let log = logsPool.get(manifest.name);

        args = this._normalizeArgs(args);

        if (args.path === undefined)
            throw new Error('volume path is undefined.');

        if (args.name === undefined)
            args.name = uuidv5(`${manifest.name} ${args.path}`, uuidv5.DNS);

        let dst = args.path;
        dst = path.resolve(manifest.workdir, dst);
        dst = path.join(layer.path, dst);

        let volume = volumes.has(args.name)
            ? volumes.get(args.name)
            : volumes.create(args.name);

        let src = volume.path;

        this._mountPath = dst;

        await ensureDir(dst);
        mountNullfs(src, dst); 

    }

    async unExec() {

        if (this._mountPath) umount(this._mountPath, true);

    }

}

module.exports = VolumeCommand;