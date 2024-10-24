declare global {
    type Env = {
        Target?: string;
        DisableProxyAuth?: string;
        DisablePrefixRoute?: string;
    };

    type Table = Record<string, string | undefined | null>;
}

export {};
