import { FileTree } from "./const";



export const join = (...args: string[]) => {
    const separator = "/"; // Change this to '\\' for backslash on Windows
    return args.join(separator).replace(/\/\//g, "/");
};

/**
 * Returns true if obj is empty
 * @param obj 
 * @returns 
 */
export const emptyObj = (obj: unknown) => {
    if (typeof obj === "object" && obj !== null) {
        return Object.values(obj).length === 0;
    } else {
        return true;
    }
};

export const extname = (filePath: string) => {
    // Check if the last character is '/'
    if (filePath.charAt(filePath.length - 1) === "/") {
        return "";
    }

    // Split the file path by '/' and take the last item
    const fileName = filePath.split("/").pop();

    if (!fileName) {
        return "";
    }

    // Find the last dot in the file path
    const lastDotIndex = fileName.lastIndexOf(".");

    // If there is no dot or it's at the beginning of the file name, return an empty string
    if (lastDotIndex <= 0) {
        return "";
    }

    // Extract the extension by slicing the file path from the last dot index
    const extension = fileName.slice(lastDotIndex);

    return extension;
};

export const dirname = (filePath: string): string => {
    const separator = "/";
    const lastSeparatorIndex = filePath.lastIndexOf(separator);

    if (lastSeparatorIndex === -1) {
        return "";
    }

    return filePath.substring(0, lastSeparatorIndex);
};

export async function sha1(buffer: ArrayBuffer): Promise<string> {
    const hashBuffer = await crypto.subtle.digest("SHA-1", buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    return hashHex;
}

export function fileTreesEmpty({ localFiles, webdavFiles }: { localFiles: FileTree; webdavFiles: FileTree }): boolean {
    const hasNoRegularChanges = [
        localFiles.added,
        localFiles.deleted,
        localFiles.modified,
        webdavFiles.added,
        webdavFiles.deleted,
        webdavFiles.modified,
    ].every((record) => Object.keys(record).length === 0);

    if (!hasNoRegularChanges) {
        return false;
    }

    const hasNoExceptions = [webdavFiles.except, localFiles.except].every((record) => Object.keys(record).length === 0);

    if (hasNoExceptions) {
        // show && this.show("Nothing to sync");
        return true;
    }

    this.show("Please open control panel to solve your file exceptions");
    return true;
}



