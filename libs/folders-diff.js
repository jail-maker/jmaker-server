'use strict';

const { spawn, spawnSync, exec } = require('child_process');
const fs = require('fs');

const ACTIONS = {'+': 'A', '-': 'D'};

const diff = (src, dst) => {

    return new Promise((res, rej) => {

        let resData = '';
        let rejData = '';

        let child = spawn('rsync', [
            '-nav', '--delete', src, dst,
        ]);

        child.stdout.on('data', data => resData += data);
        child.stderr.on('data', data => rejData += data);

        child.on('exit', (code, signal) => {

            if (code <= 1) res(resData.trim());
            else {

                let error = new Error(rejData);
                rej(error);

            }

        });

    });

}

class DiffOut {

    toString() {

        let ret = '';

        for (let line of this.genLines())
            ret += `${line[0]} ${line[1]}\n`;

        return ret.trim('\n');

    }

    files(marks = ['A', 'D', 'C']) {

        let ret = [];

        for (let line of this.genLines()) {

            if (marks.includes(line[0])) ret.push(line[1]);

        }

        return ret;

    }

    * genLines() {

        for (let file in this) {

            yield [this[file], file];

        }

    }

    * [Symbol.iterator]() {

        return this.genLines();

    }

}


module.exports = async (...folders) => {

    let diffOut = (await diff(...folders))
        .toString()
        .trim('\n');

    let symlinks = /^(.+) -> (.+)$/imu;
    let deleting = /^deleting (.+)$/imu;

    let ret = diffOut.split('\n').slice(1, -3).reduce((acc, line, key) => {

        if (line.slice(-1) === '/') return acc;

        let matches = line.match(deleting);

        if (matches) {

            let file = `./${matches[1]}`;
            acc[file] = 'D';
            return acc;

        }

        matches = line.match(symlinks);

        if (matches) {

            let file = `./${matches[1]}`;
            acc[file] = 'A';
            return acc;

        }

        let file = `./${line}`;
        acc[file] = 'A';
        return acc;

    }, new DiffOut);

    return ret;

}
