import { Project, ScriptTarget } from 'ts-morph';
export class CodeGeneratorEngine {
    tsProject;
    constructor() {
        this.tsProject = new Project({
            compilerOptions: {
                target: ScriptTarget.ES2022,
                module: 1,
                strict: true,
                esModuleInterop: true,
                skipLibCheck: true,
                forceConsistentCasingInFileNames: true,
            },
        });
    }
    createSourceFile(filePath, content) {
        this.tsProject.createSourceFile(filePath, content, { overwrite: true });
    }
    async save() {
        await this.tsProject.save();
    }
    get project() {
        return this.tsProject;
    }
}
//# sourceMappingURL=index.js.map