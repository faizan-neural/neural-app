"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs-extra");
const ApiStatusCodes_1 = require("../api/ApiStatusCodes");
class TemplateHelper {
    constructor() {
        const templates = [
            {
                templateName: 'node',
                dockerHubImageName: 'library/node',
                tagSuffix: '-alpine',
            },
            {
                templateName: 'php',
                dockerHubImageName: 'library/php',
                tagSuffix: '-apache',
            },
            {
                templateName: 'python-django',
                dockerHubImageName: 'library/python',
                tagSuffix: '-alpine',
            },
            {
                templateName: 'ruby-rack',
                dockerHubImageName: 'library/ruby',
                tagSuffix: '-alpine',
            },
        ];
        const dockerfilesRoot = __dirname + '/../../dockerfiles/';
        for (let i = 0; i < templates.length; i++) {
            templates[i].postFromLines = fs.readFileSync(dockerfilesRoot + templates[i].templateName, 'utf8');
        }
        this.templates = templates;
        // Change to true if you want tags to be printed on screen upon start up (after 40 sec ish)
        // new TemplateHelperVersionPrinter().printAvailableImageTagsForReadme(
        //     this.templates
        // )
    }
    getTemplateFromTemplateName(templateName) {
        for (let i = 0; i < this.templates.length; i++) {
            if (this.templates[i].templateName === templateName) {
                return this.templates[i];
            }
        }
        throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, `TEMPLATE NAME NOT FOUND: ${templateName}`);
    }
    getDockerfileContentFromTemplateTag(templateAndVersion) {
        const self = this;
        const templateName = templateAndVersion.split('/')[0];
        const templateVersion = templateAndVersion.split('/')[1];
        if (!templateVersion) {
            throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'Template version field is empty!');
        }
        const templateObj = self.getTemplateFromTemplateName(templateName);
        const fromLine = `${templateObj.dockerHubImageName}:${templateVersion}${templateObj.tagSuffix}`;
        return `FROM ${fromLine}
${templateObj.postFromLines}`;
    }
}
const templateHelperInstance = new TemplateHelper();
exports.default = {
    get: function () {
        return templateHelperInstance;
    },
};
//# sourceMappingURL=TemplateHelper.js.map