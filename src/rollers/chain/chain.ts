import { BasicRoller } from "../roller";

export class ChainRoller extends BasicRoller {
    result: any;
    subRollers: BasicRoller[] = [];

    build(): Promise<void>
    {
        throw new Error("Method not implemented.");
    }

    async getReplacer(): Promise<string>
    {
        throw new Error("Method not implemented.");
    }

    getTooltip(): string
    {
        throw new Error("Method not implemented.");
    }

    roll(): Promise<any>
    {
        throw new Error("Method not implemented.");
    }
}
