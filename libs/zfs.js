'use strict';

const { spawn, spawnSync } = require('child_process');

const ExistsError = require('./errors/exists-error.js');
const CommandError = require('./errors/command-error.js');
const NotFoundError = require('./errors/not-found-error.js');

class Zfs {

    _checkPool(pool) {

        let result = spawnSync('zpool', [
            'list', '-o', 'name', '-H'
        ]);

        let pools = result.stdout
            .toString()
            .trim()
            .split(/\n/);

        if (pools.indexOf(pool) === -1) {

            let msg = `Pool "${pool}" not found.\n`
            msg += `Available pools: ${pools.join(', ')}`;
            throw new NotFoundError(msg);

        }

    }

    create(name, options = {}) {

        options = Object.keys(options)
            .map(opt => `${opt}=${options[opt]}`);

        if (options.length) options = ['-o', ...options];

        let result = spawnSync('zfs', [
            'create', '-p', ...options, name,
        ]);

        let msg = '';

        switch (result.status) {

            case 1:
                msg = `An error occurred. Dataset: ${name}`;
                throw new ExistsError(msg);
                break;

            case 2:
                msg = `Invalid command line options were specified. Dataset: ${name}`;
                throw new CommandError(msg);
                break;

        }

    }

    destroy(fs, snap = null) {

        let name = (snap !== null) ? `${fs}@${snap}` : fs;

        let result = spawnSync('zfs', [
            'destroy', '-R', '-f', name
        ]);

        return result.status ? false : true;

    }

    snapshot(fs, name) {

        let result = spawnSync('zfs', [
            'snapshot', `${fs}@${name}`
        ]);

        let msg = '';

        switch (result.status) {

            case 1:
                msg = 'Snapshot all ready exists.';
                throw new ExistsError(msg);
                break;

            case 2:
                msg = 'Invalid command line options were specified.';
                throw new CommandError(msg);
                break;

        }

    }

    rollback(fs, name) {

        let snapshot = `${fs}@${name}`;
        let result = spawnSync('zfs', [
            'rollback', '-Rf', snapshot
        ]);

        let msg = '';

        switch (result.status) {

            case 1:
                msg = `An error occurred. Snapshot: ${snapshot}`;
                break;

            case 2:
                msg = `Invalid command line options were specified. Snapshot: ${snapshot}`;
                break;

        }

        if (result.status) {

            let error = new CommandError(msg);
            error.exitStatus = result.status;
            throw error;

        }

    }

    clone(fs, snap, newFs, options = {}) {

        options = Object.keys(options)
            .map(opt => `${opt}=${options[opt]}`);

        if (options.length) options = ['-o', ...options];

        let result = spawnSync('zfs', [
            'clone', ...options, `${fs}@${snap}`, `${newFs}`
        ]);

        return result.status ? false : true;

    }

    promote(clone) {

        let result = spawnSync('zfs', [
            'promote', clone,
        ]);

        let msg = '';

        switch (result.status) {

            case 1:
                msg = `An error occurred. Dataset: ${clone}`;
                throw new ExistsError(msg);
                break;

            case 2:
                msg = `Invalid command line options were specified. Dataset: ${clone}`;
                throw new CommandError(msg);
                break;

        }

    }

    get(name, option) {

        let result = spawnSync('zfs', [
            'get', '-o', 'value', '-H', option, name
        ]);

        return result.stdout.toString().trim();

    }

    set(name, option, value) {

        let result = spawnSync('zfs', [
            'set', `${option}=${value}`, name
        ]);

        return result.status ? false : true;

    }

    has(name) {

        let result = spawnSync('zfs', [
            'list', '-o', 'name', '-H', `${name}`
        ]);

        return (result.status === 0) ? true : false;

    }

    list(options = {}) {

        let {
            prefix = '',
            sortAsc = [],
            sortDesc = [],
            type = ['filesystem'],
            display = ['name'],
            parsableNumbers = true,
        } = options;

        let sortAscArgs = sortAsc.reduce((acc, item) => [...acc, '-s', item], []);
        let sortDescArgs = sortDesc.reduce((acc, item) => [...acc, '-S', item], []);

        let typeArg = type.length ? ['-t', type.join(',')] : [];
        let displayArg = display.length ? ['-o', display.join(',')] : [];

        let parsableNumbersArg = parsableNumbers ? ['-p'] : [];

        let result = spawnSync('zfs', [
            'list', '-H',
            ...parsableNumbersArg,
            ...sortAscArgs,
            ...sortDescArgs,
            ...typeArg,
            ...displayArg,
        ]);

        let output = result.stdout
            .toString()
            .trim()
            .split('\n')
            .map(line => {
                let ret = line.split('\t');
                return ret.length > 1 ? ret : line;
            });

        let match = prefix.replace(/(\W)/, '\\$1');
        let exp = new RegExp(`^${match}\\b`);

        return output.filter(item => exp.test(item));

    }

    diff(snapshot, fs) {

        let result = spawnSync('zfs', [
            'diff', '-F', snapshot, fs
        ]);

        let msg = '';

        if (result.status !== 0) throw new CommandError(msg);

        return result.stdout;

    }

}

module.exports = new Zfs;
