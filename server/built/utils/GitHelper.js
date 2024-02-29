"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const childProcess = require("child_process");
const fs = require("fs-extra");
const path = require("path");
const git = require("simple-git/promise");
const util = require("util");
const uuid = require("uuid");
const CaptainConstants_1 = require("./CaptainConstants");
const Logger_1 = require("./Logger");
const Utils_1 = require("./Utils");
const exec = util.promisify(childProcess.exec);
class GitHelper {
    static getLastHash(directory) {
        return git(directory) //
            .silent(true) //
            .raw(['rev-parse', 'HEAD']); //
    }
    static clone(username, pass, sshKey, repo, branch, directory) {
        const USER = encodeURIComponent(username);
        const PASS = encodeURIComponent(pass);
        if (sshKey) {
            const SSH_KEY_PATH = path.join(CaptainConstants_1.default.captainRootDirectoryTemp, uuid.v4());
            const sanitized = GitHelper.sanitizeRepoPathSsh(repo);
            const REPO_GIT_PATH = sanitized.repoPath;
            const SSH_PORT = sanitized.port;
            const DOMAIN = GitHelper.getDomainFromSanitizedSshRepoPath(REPO_GIT_PATH);
            Logger_1.default.d(`Cloning SSH ${REPO_GIT_PATH}`);
            return Promise.resolve() //
                .then(function () {
                return fs.outputFile(SSH_KEY_PATH, sshKey + '');
            })
                .then(function () {
                return exec(`chmod 600 ${SSH_KEY_PATH}`);
            })
                .then(function () {
                return fs.ensureDir('/root/.ssh');
            })
                .then(function () {
                return exec(`ssh-keyscan -p ${SSH_PORT} -H ${DOMAIN} >> /root/.ssh/known_hosts`);
            })
                .then(function () {
                return git() //
                    .silent(true) //
                    .env('GIT_SSH_COMMAND', `ssh -i ${SSH_KEY_PATH}`) //
                    .raw([
                    'clone',
                    '--recurse-submodules',
                    '-b',
                    branch,
                    REPO_GIT_PATH,
                    directory,
                ]);
            })
                .then(function () {
                return fs.remove(SSH_KEY_PATH);
            });
        }
        else {
            // Some people put https when they are entering their git information
            const REPO_PATH = GitHelper.sanitizeRepoPathHttps(repo);
            // respect the explicit http repo path
            const SCHEME = repo.startsWith('http://') ? 'http' : 'https';
            const remote = `${SCHEME}://${USER}:${PASS}@${REPO_PATH}`;
            Logger_1.default.dev(`Cloning HTTPS ${remote}`);
            return git() //
                .silent(true) //
                .raw([
                'clone',
                '--recurse-submodules',
                '-b',
                branch,
                remote,
                directory,
            ])
                .then(function () {
                //
            });
        }
    }
    // input is like this: ssh://git@github.com:22/caprover/caprover-cli.git
    static getDomainFromSanitizedSshRepoPath(input) {
        return GitHelper.sanitizeRepoPathSsh(input).domain;
    }
    // It returns a string like this "github.com/username/repository.git"
    static sanitizeRepoPathHttps(input) {
        input = Utils_1.default.removeHttpHttps(input);
        if (input.toLowerCase().startsWith('git@')) {
            // at this point, input is like git@github.com:caprover/caprover-cli.git
            input = input.substring(4);
            input = input.replace(':', '/');
        }
        return input.replace(/\/$/, '');
    }
    // It returns a string like this "ssh://git@github.com:22/caprover/caprover-cli.git"
    static sanitizeRepoPathSsh(input) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        const found = input.match(GitHelper.SSH_PATH_RE);
        if (!found) {
            throw new Error(`Malformatted SSH path: ${input}`);
        }
        return {
            user: (_b = (_a = found.groups) === null || _a === void 0 ? void 0 : _a.user) !== null && _b !== void 0 ? _b : 'git',
            domain: (_c = found.groups) === null || _c === void 0 ? void 0 : _c.domain,
            port: Number((_e = (_d = found.groups) === null || _d === void 0 ? void 0 : _d.port) !== null && _e !== void 0 ? _e : 22),
            owner: (_g = (_f = found.groups) === null || _f === void 0 ? void 0 : _f.owner) !== null && _g !== void 0 ? _g : '',
            repo: (_h = found.groups) === null || _h === void 0 ? void 0 : _h.repo,
            get repoPath() {
                return `ssh://${this.user}@${this.domain}:${this.port}/${this.owner}${this.owner && '/'}${this.repo}.git`;
            },
        };
    }
}
exports.default = GitHelper;
GitHelper.SSH_PATH_RE = new RegExp([
    /^\s*/,
    /(?:(?<proto>[a-z]+):\/\/)?/,
    /(?:(?<user>[a-z_][a-z0-9_-]+)@)?/,
    /(?<domain>[^\s\/\?#:]+)/,
    /(?::(?<port>[0-9]{1,5}))?/,
    /(?:[\/:](?<owner>[^\s\/\?#:]+))?/,
    /(?:[\/:](?<repo>(?:[^\s\?#:.]|\.(?!git\/?\s*$))+))/,
    /(?:.git)?\/?\s*$/,
]
    .map((r) => r.source)
    .join(''), 'i');
//# sourceMappingURL=GitHelper.js.map