/* eslint-disable @typescript-eslint/no-inferrable-types */
import { requestUrl, RequestUrlParam, RequestUrlResponsePromise } from 'obsidian';

// Types for WebDAV connection
export interface WebDAVConnection {
    baseUrl: string;
    username: string;
    password: string;
    // Optional additional settings
    defaultHeaders?: Record<string, string>;
    timeout?: number;
}

// Helper function to create authorization header
function getAuthHeader(username: string, password: string): string {
    return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

// Helper to combine base URL with path
function createFullUrl(connection: WebDAVConnection, path: string): string {
    const baseUrl = connection.baseUrl.endsWith('/') ? connection.baseUrl.slice(0, -1) : connection.baseUrl;
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    return `${baseUrl}/${cleanPath}`;
}

// Helper to create common headers
function createHeaders(connection: WebDAVConnection, additionalHeaders: Record<string, string> = {}): Record<string, string> {
    return {
        'Authorization': getAuthHeader(connection.username, connection.password),
        ...connection.defaultHeaders,
        ...additionalHeaders
    };
}

// Export all WebDAV operations
export async function webdavGet(
    connection: WebDAVConnection, 
    path: string, 
    headers: Record<string, string> = {}
): Promise<RequestUrlResponsePromise> {
    return await requestUrl({
        url: createFullUrl(connection, path),
        method: 'GET',
        headers: createHeaders(connection, {
            'Depth': '1',
            ...headers
        })
    });
}

export async function webdavPut(
    connection: WebDAVConnection,
    path: string,
    content: string | ArrayBuffer,
    headers: Record<string, string> = {}
): Promise<RequestUrlResponsePromise> {
    return await requestUrl({
        url: createFullUrl(connection, path),
        method: 'PUT',
        body: content,
        headers: createHeaders(connection, {
            'Content-Type': 'application/octet-stream',
            ...headers
        })
    });
}

export async function webdavDelete(
    connection: WebDAVConnection,
    path: string,
    headers: Record<string, string> = {}
): Promise<RequestUrlResponsePromise> {
    return await requestUrl({
        url: createFullUrl(connection, path),
        method: 'DELETE',
        headers: createHeaders(connection, headers)
    });
}

export async function webdavPropfind(
    connection: WebDAVConnection,
    path: string,
    depth: '0' | '1' | 'infinity' = '1',
    headers: Record<string, string> = {}
): Promise<RequestUrlResponsePromise> {
    return await requestUrl({
        url: createFullUrl(connection, path),
        method: 'PROPFIND',
        headers: createHeaders(connection, {
            'Depth': depth,
            'Content-Type': 'application/xml',
            ...headers
        }),
        body: `<?xml version="1.0" encoding="utf-8" ?>
        <propfind xmlns="DAV:">
            <allprop/>
        </propfind>`
    });
}

export async function webdavMkcol(
    connection: WebDAVConnection,
    path: string,
    headers: Record<string, string> = {}
): Promise<RequestUrlResponsePromise> {
    return await requestUrl({
        url: createFullUrl(connection, path),
        method: 'MKCOL',
        headers: createHeaders(connection, headers)
    });
}

export async function webdavCopy(
    connection: WebDAVConnection,
    sourcePath: string,
    destinationPath: string,
    overwrite: boolean = true,
    headers: Record<string, string> = {}
): Promise<RequestUrlResponsePromise> {
    return await requestUrl({
        url: createFullUrl(connection, sourcePath),
        method: 'COPY',
        headers: createHeaders(connection, {
            'Destination': createFullUrl(connection, destinationPath),
            'Overwrite': overwrite ? 'T' : 'F',
            ...headers
        })
    });
}

export async function webdavMove(
    connection: WebDAVConnection,
    sourcePath: string,
    destinationPath: string,
    overwrite: boolean = true,
    headers: Record<string, string> = {}
): Promise<RequestUrlResponsePromise> {
    return await requestUrl({
        url: createFullUrl(connection, sourcePath),
        method: 'MOVE',
        headers: createHeaders(connection, {
            'Destination': createFullUrl(connection, destinationPath),
            'Overwrite': overwrite ? 'T' : 'F',
            ...headers
        })
    });
}

export async function webdavProppatch(
    connection: WebDAVConnection,
    path: string,
    propertyName: string,
    propertyValue: string,
    headers: Record<string, string> = {}
): Promise<RequestUrlResponsePromise> {
    return await requestUrl({
        url: createFullUrl(connection, path),
        method: 'PROPPATCH',
        headers: createHeaders(connection, {
            'Content-Type': 'application/xml',
            ...headers
        }),
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

export async function webdavLock(
    connection: WebDAVConnection,
    path: string,
    owner: string,
    timeout: string = 'Infinite',
    headers: Record<string, string> = {}
): Promise<RequestUrlResponsePromise> {
    return await requestUrl({
        url: createFullUrl(connection, path),
        method: 'LOCK',
        headers: createHeaders(connection, {
            'Timeout': timeout,
            'Content-Type': 'application/xml',
            ...headers
        }),
        body: `<?xml version="1.0" encoding="utf-8" ?>
        <lockinfo xmlns="DAV:">
            <lockscope><exclusive/></lockscope>
            <locktype><write/></locktype>
            <owner>${owner}</owner>
        </lockinfo>`
    });
}

export async function webdavUnlock(
    connection: WebDAVConnection,
    path: string,
    lockToken: string,
    headers: Record<string, string> = {}
): Promise<RequestUrlResponsePromise> {
    return await requestUrl({
        url: createFullUrl(connection, path),
        method: 'UNLOCK',
        headers: createHeaders(connection, {
            'Lock-Token': lockToken,
            ...headers
        })
    });
}

