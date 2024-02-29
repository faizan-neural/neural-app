"use strict";
/*
                              +---------------------------------+
+------------------+          |                                 |
|------------------|          |      Assign the final Image     |                +--------------------+
||                ||          |        (library/mysql           +----------------+   Retag and push   +<-----------+
||    Update      |-----------+             or                  |                |     IF NEEDED      |            |
||Captain Service ||          |  repo.com:996/captain/myimage)  |                +--------------------+            |
||                ||          |                                 |                                                  |
|------------------|          |     as new ver's image          +-----------+                                      +
+------------------+          |                                 |           |                                    CREATE
                              +---------------------------------+           |                             img-captain--appname:5
                              |                                 |           |
                              |    Set the Deployed Version     |           +-------------+                         ^
                              +---------------------------------+                         |                         |
                                                                                          |                         |
                                                                                          |                         |
                                                                                          |                         |
                                                          +-----------------------+       |                         |
                                                          |                       |       |                         |
                                                          |      Docker ImageName +-------+                         |
                                                          |                       |                                 |
                                                          +-----------------------+                                 |
       +-------------------+                              |                       |                                 |
       |                   |                              |    captain-definition +-------------+                   |
       |                   |                              |         content       |             |                   |
       |   ServiceManager  +----> CreateNewVersion +----> +-----------------------+             |                   |
       |                   |                              |                       |             ^                   |
       |                   |                              |         Uploaded Tar  +-----------------> ImageMaker.   +
       +-------------------+                              |                       |             ^       createImage(appName,Ver,Data)
                                                          +-----------------------+             |
                                                          |                       |             |
                                                          |             GIT Repo  +-------------+
                                                          |                       |
                                                          +-----------------------+

*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.BuildLogsManager = void 0;
const fs = require("fs-extra");
const tar = require("tar");
const path = require("path");
const ApiStatusCodes_1 = require("../api/ApiStatusCodes");
const CaptainConstants_1 = require("../utils/CaptainConstants");
const GitHelper_1 = require("../utils/GitHelper");
const BuildLog_1 = require("./BuildLog");
const TemplateHelper_1 = require("./TemplateHelper");
const RAW_SOURCE_DIRECTORY = 'source_files';
const TAR_FILE_NAME_READY_FOR_DOCKER = 'image.tar';
const DOCKER_FILE = 'Dockerfile';
class BuildLogsManager {
    constructor() {
        this.buildLogs = {};
    }
    getAppBuildLogs(appName) {
        const self = this;
        self.buildLogs[appName] =
            self.buildLogs[appName] ||
                new BuildLog_1.default(CaptainConstants_1.default.configs.buildLogSize);
        return self.buildLogs[appName];
    }
}
exports.BuildLogsManager = BuildLogsManager;
class ImageMaker {
    constructor(dockerRegistryHelper, dockerApi, namespace, buildLogsManager) {
        this.dockerRegistryHelper = dockerRegistryHelper;
        this.dockerApi = dockerApi;
        this.namespace = namespace;
        this.buildLogsManager = buildLogsManager;
        //
    }
    getDirectoryForRawSource(appName, version) {
        return `${CaptainConstants_1.default.captainRawSourceDirectoryBase}/${appName}/${version}`;
    }
    /**
     * Creates image if necessary, or just simply passes the image name
     */
    ensureImage(imageSource, appName, captainDefinitionRelativeFilePath, appVersion, envVars) {
        const self = this;
        const logs = self.buildLogsManager.getAppBuildLogs(appName);
        logs.clear();
        logs.log(`------------------------- ${new Date()}`);
        logs.log(`Build started for ${appName}`);
        let gitHash = '';
        const baseDir = self.getDirectoryForRawSource(appName, appVersion);
        const rawDir = `${baseDir}/${RAW_SOURCE_DIRECTORY}`;
        const tarFilePath = `${baseDir}/${TAR_FILE_NAME_READY_FOR_DOCKER}`;
        const baseImageNameWithoutVerAndReg = `img-${this.namespace}-${appName // img-captain-myapp
        }`;
        let fullImageName = ''; // repo.domain.com:998/username/reponame:8
        return Promise.resolve() //
            .then(function () {
            return self.extractContentIntoDestDirectory(imageSource, rawDir, captainDefinitionRelativeFilePath);
        })
            .then(function (gitHashFromImageSource) {
            gitHash = gitHashFromImageSource;
            const includesGitCommitEnvVar = envVars.find((envVar) => envVar.key === CaptainConstants_1.default.gitShaEnvVarKey);
            if (gitHash && !includesGitCommitEnvVar) {
                envVars.push({
                    key: CaptainConstants_1.default.gitShaEnvVarKey,
                    value: gitHash,
                });
            }
            // some users convert the directory into TAR instead of converting the content into TAR.
            // we go one level deep and try to find the right directory.
            // Also, they may have no captain-definition file, in that case, fall back to Dockerfile if exists.
            return self.getAbsolutePathOfCaptainDefinition(rawDir, captainDefinitionRelativeFilePath);
        })
            .then(function (captainDefinitionAbsolutePath) {
            return self
                .getCaptainDefinition(captainDefinitionAbsolutePath)
                .then(function (captainDefinition) {
                if (captainDefinition.imageName) {
                    logs.log(`An explicit image name was provided (${captainDefinition.imageName}). Therefore, no build process is needed.`);
                    logs.log(`Pulling this image: ${captainDefinition.imageName} This process might take a few minutes.`);
                    const providedImageName = captainDefinition.imageName + '';
                    return Promise.resolve() //
                        .then(function () {
                        return self.dockerRegistryHelper.getDockerAuthObjectForImageName(providedImageName);
                    })
                        .then(function (authObj) {
                        return self.dockerApi.pullImage(providedImageName, authObj);
                    })
                        .then(function () {
                        return providedImageName;
                    });
                }
                return self.getBuildPushAndReturnImageName(captainDefinition, path.dirname(captainDefinitionAbsolutePath), tarFilePath, baseImageNameWithoutVerAndReg, appName, appVersion, envVars);
            });
        })
            .then(function (ret) {
            fullImageName = ret;
        })
            .then(function () {
            return fs.remove(baseDir);
        })
            .then(function () {
            if (imageSource.uploadedTarPathSource) {
                return fs.remove(imageSource.uploadedTarPathSource.uploadedTarPath);
            }
        })
            .catch(function (err) {
            return fs
                .remove(baseDir)
                .then(function () {
                throw err;
            })
                .catch(function () {
                return Promise.reject(err);
            });
        })
            .catch(function (err) {
            if (imageSource.uploadedTarPathSource) {
                return fs
                    .remove(imageSource.uploadedTarPathSource.uploadedTarPath)
                    .then(function () {
                    throw err;
                })
                    .catch(function () {
                    return Promise.reject(err);
                });
            }
            return Promise.reject(err);
        })
            .then(function () {
            logs.log(`Build has finished successfully!`);
            return {
                imageName: fullImageName,
                gitHash: gitHash,
            };
        })
            .catch(function (error) {
            logs.log(`Build has failed!`);
            return Promise.reject(error);
        });
    }
    getBuildPushAndReturnImageName(captainDefinition, correctedDirProvided, tarFilePath, baseImageNameWithoutVersionAndReg, appName, appVersion, envVars) {
        const self = this;
        return Promise.resolve() //
            .then(function () {
            return self
                .convertCaptainDefinitionToDockerfile(captainDefinition, correctedDirProvided)
                .then(function () {
                return self.convertContentOfDirectoryIntoTar(correctedDirProvided, tarFilePath);
            })
                .then(function () {
                return self.dockerRegistryHelper.createDockerRegistryConfig();
            })
                .then(function (registryConfig) {
                return self.dockerApi
                    .buildImageFromDockerFile(baseImageNameWithoutVersionAndReg, appVersion, tarFilePath, self.buildLogsManager.getAppBuildLogs(appName), envVars, registryConfig)
                    .catch(function (error) {
                    throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.BUILD_ERROR, `${error}`.trim());
                });
            })
                .then(function () {
                return self.dockerRegistryHelper.retagAndPushIfDefaultPushExist(baseImageNameWithoutVersionAndReg, appVersion, self.buildLogsManager.getAppBuildLogs(appName));
            });
        });
    }
    /**
     * Extracts the content of IImageSource into destDirectory and returns a promise that resolvea
     * to git hash that was provided in IImageSource
     *
     * @param source        the image source
     * @param destDirectory the path to directory where we want to have all our contents
     */
    extractContentIntoDestDirectory(source, destDirectory, captainDefinitionRelativeFilePath) {
        return Promise.resolve() //
            .then(function () {
            return fs.ensureDir(destDirectory);
        })
            .then(function () {
            // If uploadedTarPath then extract into a directory
            //
            // If Repo then download.
            //
            // If captainDefinitionContent then create a directory and output to a directory
            //
            // Else THROW ERROR
            const srcTar = source.uploadedTarPathSource;
            if (srcTar) {
                // extract file to to destDirectory
                return tar
                    .extract({
                    file: srcTar.uploadedTarPath,
                    cwd: destDirectory,
                })
                    .then(function () {
                    return srcTar.gitHash;
                });
            }
            const srcRepo = source.repoInfoSource;
            if (srcRepo) {
                return GitHelper_1.default.clone(srcRepo.user, srcRepo.password, srcRepo.sshKey || '', srcRepo.repo, srcRepo.branch, destDirectory) //
                    .then(function () {
                    return GitHelper_1.default.getLastHash(destDirectory);
                });
            }
            const captainDefinitionContentSource = source.captainDefinitionContentSource;
            if (captainDefinitionContentSource) {
                return fs
                    .outputFile(path.join(destDirectory, captainDefinitionRelativeFilePath), captainDefinitionContentSource.captainDefinitionContent)
                    .then(function () {
                    return captainDefinitionContentSource.gitHash;
                });
            }
            // we should never get here!
            throw new Error('Source is unknown!');
        });
    }
    getAllChildrenOfDirectory(directory) {
        return Promise.resolve() //
            .then(function () {
            return new Promise(function (resolve, reject) {
                fs.readdir(directory, function (err, files) {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve(files);
                });
            });
        });
    }
    getCaptainDefinition(captainDefinitionAbsolutePath) {
        return Promise.resolve() //
            .then(function () {
            return fs.readJson(captainDefinitionAbsolutePath);
        })
            .then(function (data) {
            if (!data) {
                throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'Captain Definition File is empty!');
            }
            if (!data.schemaVersion) {
                throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'Captain Definition version is empty!');
            }
            if (data.schemaVersion !== 2) {
                throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'Captain Definition version is not supported! Read migration guides to schemaVersion 2');
            }
            const hasDockerfileLines = data.dockerfileLines && data.dockerfileLines.length > 0;
            const numberOfProperties = (data.templateId ? 1 : 0) +
                (data.imageName ? 1 : 0) +
                (data.dockerfilePath ? 1 : 0) +
                (hasDockerfileLines ? 1 : 0);
            if (numberOfProperties !== 1) {
                throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'One, and only one, of these properties should be present in captain-definition: templateId, imageName, dockerfilePath, or, dockerfileLines');
            }
            return data;
        });
    }
    convertCaptainDefinitionToDockerfile(captainDefinition, directoryWithCaptainDefinition) {
        return Promise.resolve() //
            .then(function () {
            const data = captainDefinition;
            if (data.templateId) {
                return TemplateHelper_1.default.get().getDockerfileContentFromTemplateTag(data.templateId);
            }
            else if (data.dockerfileLines) {
                return data.dockerfileLines.join('\n');
            }
            else if (data.dockerfilePath) {
                if (data.dockerfilePath.startsWith('..')) {
                    throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'dockerfilePath should not refer to parent directory!');
                }
                return fs
                    .readFileSync(path.join(directoryWithCaptainDefinition, data.dockerfilePath))
                    .toString();
            }
            else if (data.imageName) {
                throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'ImageName cannot be rebuilt');
            }
            else {
                throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'dockerfileLines, dockerFilePath, templateId or imageName must be present. Both should not be present at the same time');
            }
        })
            .then(function (dockerfileContent) {
            return fs.outputFile(`${directoryWithCaptainDefinition}/${DOCKER_FILE}`, dockerfileContent);
        });
    }
    getAbsolutePathOfCaptainDefinition(originalDirectory, captainDefinitionRelativeFilePath) {
        const self = this;
        function isCaptainDefinitionOrDockerfileInDir(dir) {
            const captainDefinitionPossiblePath = path.join(dir, captainDefinitionRelativeFilePath);
            return Promise.resolve()
                .then(function () {
                return fs.pathExists(captainDefinitionPossiblePath);
            })
                .then(function (exits) {
                return (!!exits &&
                    fs.statSync(captainDefinitionPossiblePath).isFile());
            })
                .then(function (captainDefinitionExists) {
                if (captainDefinitionExists)
                    return true;
                // Falling back to plain Dockerfile, check if it exists!
                const dockerfilePossiblePath = path.join(dir, DOCKER_FILE);
                return fs
                    .pathExists(dockerfilePossiblePath)
                    .then(function (exits) {
                    return (!!exits &&
                        fs.statSync(dockerfilePossiblePath).isFile());
                })
                    .then(function (dockerfileExists) {
                    if (!dockerfileExists)
                        return false;
                    const captainDefinitionDefault = {
                        schemaVersion: 2,
                        dockerfilePath: `./${DOCKER_FILE}`,
                    };
                    return fs
                        .outputFile(captainDefinitionPossiblePath, JSON.stringify(captainDefinitionDefault))
                        .then(function () {
                        return true;
                    });
                });
            });
        }
        return Promise.resolve()
            .then(function () {
            // make sure if you need to go to child directory
            return isCaptainDefinitionOrDockerfileInDir(originalDirectory);
        })
            .then(function (exists) {
            if (exists)
                return originalDirectory;
            // check if there is only one child
            // check if it's a directory
            // check if captain definition exists in it
            // if so, return the child directory
            return self
                .getAllChildrenOfDirectory(originalDirectory)
                .then(function (files) {
                files = files || [];
                if (files.length === 1) {
                    return isCaptainDefinitionOrDockerfileInDir(path.join(originalDirectory, files[0])) //
                        .then(function (existsInChild) {
                        if (existsInChild)
                            return path.join(originalDirectory, files[0]);
                        throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'Captain Definition file does not exist!');
                    });
                }
                throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'Captain Definition file does not exist!');
            });
        })
            .then(function (correctedRootDirectory) {
            return path.join(correctedRootDirectory, captainDefinitionRelativeFilePath);
        });
    }
    convertContentOfDirectoryIntoTar(sourceDirectory, tarFilePath) {
        return Promise.resolve() //
            .then(function () {
            return tar.c({
                file: tarFilePath,
                cwd: sourceDirectory,
            }, ['./']);
        });
    }
}
exports.default = ImageMaker;
//# sourceMappingURL=ImageMaker.js.map