import type { GeneratorContext as SdkContext } from '@living-contracts/types';
export declare class SdkGenerator {
    private ctx;
    constructor(ctx: SdkContext);
    generate(): string[];
    private pluralize;
    private getPrismaType;
    private generateTypes;
    private generateClient;
}
//# sourceMappingURL=index.d.ts.map