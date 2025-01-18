export enum Status {
    NONE = "✔️",
    CHECK = "🔎",
    PULL = "⬇️",
    PUSH = "⬆️",
    SYNC = "⏳",
    ERROR = "❌",
    AUTO = "🔄",
    TEST = "🧪",
    SAVE = "💾",
    PAUSE = "⏸️",
    OFFLINE = "📴",
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

export const DEFAULT_SETTINGS: Partial<CloudrSettings> = {
    folderSettings: [],
    
    url: "",
    username: "",
    password: "",

    webdavPath: "",
    overrideVault: "",
    exclusions: {
        directories: ["node_modules", ".git", "webdav"],
        extensions: [".exe"],
        markers: ["prevdata.json", ".obsidian/workspace.json"],
    },
    exclusionsOverride: false,

    liveSync: false,
    autoSync: false,
    autoSyncInterval: 30,
    enableRibbons: true,
    skipHiddenMobile: false,
    skipHiddenDesktop: false,
};

export interface CloudrSettings {
    // Additional folder syncs
    folderSettings: WebdavFolderSettings[];

    url: string;
    username: string;
    password: string;
    webdavPath: string;
    overrideVault: string;
    exclusions: Exclusions;
    exclusionsOverride: boolean;

    liveSync: boolean;
    autoSync: boolean;
    autoSyncInterval: number;
    modifySyncInterval: number;
    modifySync: boolean;
    enableRibbons: boolean;
    skipHiddenDesktop: boolean;
    skipHiddenMobile: boolean;
}

export interface Exclusions {
    directories: string[];
    extensions: string[];
    markers: string[];
}

export interface WebdavFolderSettings {
    enabled: boolean;
    name: string;           // Display name for the folder
    url: string;           // WebDAV server URL
    username: string;
    password: string;
    remotePath: string;    // Path on WebDAV server
    localPath: string;     // Path in Obsidian vault
}