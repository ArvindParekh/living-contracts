"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiGenerator = void 0;
var path_1 = require("path");
var ApiGenerator = /** @class */ (function () {
    function ApiGenerator(ctx) {
        this.ctx = ctx;
    }
    ApiGenerator.prototype.generate = function () {
        var _this = this;
        var files = [];
        var _a = this.ctx, parsedSchema = _a.parsedSchema, outputBaseDir = _a.outputBaseDir;
        parsedSchema.models.forEach(function (model) {
            var content = _this.generateAPIEndpoint(model);
            var fileName = "".concat(model.name.toLowerCase(), "s.ts");
            _this.ctx.tsProject.createSourceFile(path_1.default.join(outputBaseDir, fileName), content, {
                overwrite: true,
            });
            files.push("api/".concat(fileName));
        });
        // index file aggregating exports
        var indexContent = "// Generated API routes\n".concat(parsedSchema.models
            .map(function (m) { return "export * as ".concat(m.name.toLowerCase(), " from './").concat(m.name.toLowerCase(), "s'"); })
            .join('\n'), "\n");
        this.ctx.tsProject.createSourceFile(path_1.default.join(outputBaseDir, 'index.ts'), indexContent, {
            overwrite: true,
        });
        files.push('api/index.ts');
        return files;
    };
    ApiGenerator.prototype.pluralize = function (str) {
        if (str.endsWith('y'))
            return str.slice(0, -1) + 'ies';
        if (str.endsWith('s'))
            return str + 'es';
        return str + 's';
    };
    ApiGenerator.prototype.generateAPIEndpoint = function (model) {
        var modelLowerCase = model.name.toLowerCase();
        var modelPlural = this.pluralize(modelLowerCase);
        return "// Generated API endpoints for ".concat(model.name, "\nimport { PrismaClient } from '@prisma/client'\nimport { ").concat(model.name, "Schema } from '../validation/schemas'\nimport type { ").concat(model.name, " } from '../sdk/types'\n\nconst prisma = new PrismaClient()\n\n// GET /").concat(modelPlural, "\nexport async function findMany(params?: { skip?: number; take?: number; where?: any }): Promise<").concat(model.name, "[]> {\n  return prisma.").concat(modelLowerCase, ".findMany({\n    skip: params?.skip,\n    take: params?.take,\n    where: params?.where,\n  })\n}\n\n// GET /").concat(modelPlural, "/:id\nexport async function findById(id: string | number): Promise<").concat(model.name, " | null> {\n  return prisma.").concat(modelLowerCase, ".findUnique({ where: { id } })\n}\n\n// POST /").concat(modelPlural, "\nexport async function create(data: any): Promise<").concat(model.name, "> {\n  const validated = ").concat(model.name, "Schema.parse(data)\n  return prisma.").concat(modelLowerCase, ".create({ data: validated })\n}\n\n// PATCH /").concat(modelPlural, "/:id\nexport async function update(id: string | number, data: any): Promise<").concat(model.name, "> {\n  const validated = ").concat(model.name, "Schema.partial().parse(data)\n  return prisma.").concat(modelLowerCase, ".update({ where: { id }, data: validated })\n}\n\n// DELETE /").concat(modelPlural, "/:id\nexport async function remove(id: string | number): Promise<void> {\n  await prisma.").concat(modelLowerCase, ".delete({ where: { id } })\n}\n");
    };
    return ApiGenerator;
}());
exports.ApiGenerator = ApiGenerator;
