/* eslint-disable @typescript-eslint/no-inferrable-types */
import {requestUrl} from 'obsidian';

// Basic WebDAV operations using Obsidian's requestUrl

// GET - Retrieve a resource
export async function webdavGet(url: string, headers: Record<string, string> = {}) {
    return await requestUrl({
        url,
        method: 'GET',
        headers: {
            'Depth': '1',  // Common WebDAV header
            ...headers
        }
    });
}

// PUT - Create or update a resource
export async function webdavPut(url: string, content: string | ArrayBuffer, headers: Record<string, string> = {}) {
    return await requestUrl({
        url,
        method: 'PUT',
        body: content,
        headers: {
            'Content-Type': 'application/octet-stream',
            ...headers
        }
    });
}

// DELETE - Remove a resource
export async function webdavDelete(url: string, headers: Record<string, string> = {}) {
    return await requestUrl({
        url,
        method: 'DELETE',
        headers
    });
}

// PROPFIND - Retrieve properties of a resource
export async function webdavPropfind(url: string, depth: '0' | '1' | 'infinity' = '1', headers: Record<string, string> = {}) {
    return await requestUrl({
        url,
        method: 'PROPFIND',
        headers: {
            'Depth': depth,
            'Content-Type': 'application/xml',
            ...headers
        },
        body: `<?xml version="1.0" encoding="utf-8" ?>
        <propfind xmlns="DAV:">
            <allprop/>
        </propfind>`
    });
}

// MKCOL - Create a collection/directory
export async function webdavMkcol(url: string, headers: Record<string, string> = {}) {
    return await requestUrl({
        url,
        method: 'MKCOL',
        headers
    });
}

// COPY - Copy a resource
export async function webdavCopy(url: string, destination: string, overwrite: boolean = true, headers: Record<string, string> = {}) {
    return await requestUrl({
        url,
        method: 'COPY',
        headers: {
            'Destination': destination,
            'Overwrite': overwrite ? 'T' : 'F',
            ...headers
        }
    });
}

// MOVE - Move a resource
export async function webdavMove(url: string, destination: string, overwrite: boolean = true, headers: Record<string, string> = {}) {
    return await requestUrl({
        url,
        method: 'MOVE',
        headers: {
            'Destination': destination,
            'Overwrite': overwrite ? 'T' : 'F',
            ...headers
        }
    });
}

// PROPPATCH - Modify properties of a resource
export async function webdavProppatch(url: string, propertyName: string, propertyValue: string, headers: Record<string, string> = {}) {
    return await requestUrl({
        url,
        method: 'PROPPATCH',
        headers: {
            'Content-Type': 'application/xml',
            ...headers
        },
        body: `<?xml version="1.0" encoding="utf-8" ?>
        <propertyupdate xmlns="DAV:">
            <set>
                <prop>
                    <${propertyName}>${propertyValue}</${propertyName}>
                </prop>
            </set>
        </propertyupdate>`
    });
}

// LOCK - Lock a resource
export async function webdavLock(url: string, owner: string, timeout: string = 'Infinite', headers: Record<string, string> = {}) {
    return await requestUrl({
        url,
        method: 'LOCK',
        headers: {
            'Timeout': timeout,
            'Content-Type': 'application/xml',
            ...headers
        },
        body: `<?xml version="1.0" encoding="utf-8" ?>
        <lockinfo xmlns="DAV:">
            <lockscope><exclusive/></lockscope>
            <locktype><write/></locktype>
            <owner>${owner}</owner>
        </lockinfo>`
    });
}

// UNLOCK - Unlock a resource
export async function webdavUnlock(url: string, lockToken: string, headers: Record<string, string> = {}) {
    return await requestUrl({
        url,
        method: 'UNLOCK',
        headers: {
            'Lock-Token': lockToken,
            ...headers
        }
    });
}

// Example usage:
async function example() {
    try {
        // Create a directory
        await webdavMkcol('https://webdav.server.com/newdir');
        
        // Upload a file
        await webdavPut('https://webdav.server.com/newdir/file.txt', 'Hello WebDAV!');
        
        // Get file properties
        const props = await webdavPropfind('https://webdav.server.com/newdir/file.txt', '0');
        
        // Move the file
        await webdavMove(
            'https://webdav.server.com/newdir/file.txt',
            'https://webdav.server.com/newdir/moved.txt'
        );
        
        // Lock the file
        const lockResponse = await webdavLock(
            'https://webdav.server.com/newdir/moved.txt',
            'user@example.com'
        );
        
        // Later, unlock the file
        await webdavUnlock(
            'https://webdav.server.com/newdir/moved.txt',
            lockResponse.headers['Lock-Token']
        );
        
    } catch (error) {
        console.error('WebDAV operation failed:', error);
    }
}