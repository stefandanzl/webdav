export enum Status {
    NONE = "",
    CHECK = "🔎",
    PULL = "⬇️",
    PUSH = "⬆️",
    SYNC = "⏳",
    OK = "✔️",
    ERROR = "❌",
    AUTO = "🔄",
    TEST = "🧪",
    SAVE = "💾",
    PAUSE = "⏸️",
    OFFLINE = "📴"

    
}

export type FileList = Record<string, string>;

export type FileTree = {
    added: FileList;
    deleted: FileList;
    modified: FileList;
    except: FileList;
};

export type PreviousObject = {
    date: number;
    error: boolean;
    files: FileList;
    except: FileList;
};

// This is used to build custom functionality with the sync function like inverse actions
export type Controller = {
    webdav: {
        added?: 1 | -1;
        deleted?: 1 | -1;
        modified?: 1 | -1;
        except?: 1 | -1;
    };
    local: {
        added?: 1 | -1;
        deleted?: 1 | -1;
        modified?: 1 | -1;
        except?: 1 | -1;
    };
};

export interface WebDAVResource {
    href: string;
    type: "file" | "directory";
    contentLength?: number;
    lastModified?: string;
    contentType?: string;
}

export type MethodOptions = {
    data: string | ArrayBuffer;
    headers: string;
};

export type WebDAVDirectoryItem = {
    basename: string;
    etag: string | null;
    filename: string;
    lastmod: string;
    mime: string;
    props: {
        checksum: string;
        displayname: string;
        getlastmodified: string;
        resourcetype: string | { collection: string };
        getcontentlength?: number;
        getcontenttype?: string;
        getetag?: string;
        checksums?: object;
    };
    size: number;
    type: "directory" | "file";
};
