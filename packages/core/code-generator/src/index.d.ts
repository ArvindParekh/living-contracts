import { Project } from 'ts-morph';
export declare class CodeGeneratorEngine {
    private tsProject;
    constructor();
    createSourceFile(filePath: string, content: string): void;
    save(): Promise<void>;
    get project(): Project;
}
//# sourceMappingURL=index.d.ts.map