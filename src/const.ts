export const PLUGIN_ID = "webdav";

export enum Status {
    NONE = "✔️",
    TEST = "🧪",
    CHECK = "🔎",
    SYNC = "⏳",
    AUTO = "🔄",
    SAVE = "💾",
    OFFLINE = "📴",
    ERROR = "❌",
    PULL = "🔻",
    PUSH = "🔺",
    PAUSE = "⏸️",
}

export interface StatusItem {
    emoji: string;
    class: string;
    lucide: string;
    label: string;
    color: string;
}

export const STATUS_ITEMS: Record<Status, StatusItem> = {
    [Status.NONE]: {
        emoji: "✔️",
        class: "status-none",
        lucide: "circle-check-big", //"check",
        label: "Ready",
        color: "var(--interactive-accent)",
    },
    [Status.CHECK]: {
        emoji: "🔎",
        class: "status-check",
        lucide: "search",
        label: "Checking files ...",
        color: "var(--interactive-accent)", // Blue
    },
    [Status.TEST]: {
        emoji: "🧪",
        class: "status-test",
        lucide: "flask",
        label: "Testing server connection ...",
        color: "#0000FF", // Blue
    },
    [Status.SAVE]: {
        emoji: "💾",
        class: "status-save",
        lucide: "save",
        label: "Saving current file state to disk ...",
        color: "",
    },
    [Status.SYNC]: {
        emoji: "⏳",
        class: "status-sync",
        lucide: "refresh-ccw",
        label: "Synchronising files ...",
        color: "var(--interactive-accent)",
    },
    [Status.AUTO]: {
        emoji: "🔄",
        class: "status-auto",
        lucide: "refresh-ccw-dot",
        label: "Performing automated Sync ...",
        color: "var(--interactive-accent)",
    },
    [Status.OFFLINE]: {
        emoji: "📴",
        class: "status-offline",
        lucide: "wifi-off",
        label: "Offline! Can't connect to server!",
        color: "#FF0000", // Red
    },
    [Status.ERROR]: {
        emoji: "❌",
        class: "status-error",
        lucide: "refresh-cw-off",
        label: "Error! Please check Console in DevTools!",
        color: "#FF0000", // Red
    },
    [Status.PULL]: {
        emoji: "🔻",
        class: "status-pull",
        lucide: "arrow-down-to-line",
        label: "Downloading files ...",
        color: "#FFA500", // Orange
    },
    [Status.PUSH]: {
        emoji: "🔺",
        class: "status-push",
        lucide: "arrow-up-from-line",
        label: "Uploading files ...",
        color: "#FFA500", // Orange
    },
    [Status.PAUSE]: {
        emoji: "⏸️",
        class: "status-pause",
        lucide: "pause",
        label: "User enabled Pause - Disable in Control Panel",
        color: "",
    },
};

export type Path = string;
export type Hash = string;
export type Location = "webdavFiles" | "localFiles";
export type Type = "added" | "deleted" | "modified" | "except";

export type FileList = Record<Path, Hash>;

export type FileTree = {
    added: FileList;
    deleted: FileList;
    modified: FileList;
    except: FileList;
};

export type FileTrees = {
    webdavFiles: FileTree;
    localFiles: FileTree;
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
        directories: ["webdav"],
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
    name: string; // Display name for the folder
    url: string; // WebDAV server URL
    username: string;
    password: string;
    remotePath: string; // Path on WebDAV server
    localPath: string; // Path in Obsidian vault
}
