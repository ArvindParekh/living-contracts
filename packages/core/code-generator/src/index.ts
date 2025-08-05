import { Project, ScriptTarget } from 'ts-morph';

export class CodeGeneratorEngine {
  private tsProject: Project;

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

  createSourceFile(filePath: string, content: string): void {
    this.tsProject.createSourceFile(filePath, content, { overwrite: true });
  }

  async save(): Promise<void> {
    await this.tsProject.save();
  }

  get project(): Project {
    return this.tsProject;
  }
}
