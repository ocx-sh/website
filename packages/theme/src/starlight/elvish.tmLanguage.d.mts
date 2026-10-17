declare namespace _default {
    let $schema: string;
    let name: string;
    let scopeName: string;
    let fileTypes: string[];
    let patterns: ({
        name: string;
        begin: string;
        end: string;
        patterns: {
            name: string;
            match: string;
        }[];
        match?: never;
        captures?: never;
    } | {
        name: string;
        begin: string;
        end: string;
        patterns?: never;
        match?: never;
        captures?: never;
    } | {
        name: string;
        match: string;
        begin?: never;
        end?: never;
        patterns?: never;
        captures?: never;
    } | {
        match: string;
        captures: {
            1: {
                name: string;
            };
            2: {
                name: string;
            };
        };
        name?: never;
        begin?: never;
        end?: never;
        patterns?: never;
    } | {
        match: string;
        captures: {
            1: {
                name: string;
            };
            2?: never;
        };
        name?: never;
        begin?: never;
        end?: never;
        patterns?: never;
    })[];
}
export default _default;
