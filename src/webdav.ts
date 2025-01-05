/* eslint-disable @typescript-eslint/no-inferrable-types */
// src/webdav.ts
import { requestUrl, RequestUrlResponse } from 'obsidian';
import { DOMParser } from 'xmldom';

export interface WebDAVConnection {
    baseUrl: string;
    username: string;
    password: string;
}

function createAuthHeader(username: string, password: string): string {
    return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

function createFullUrl(baseUrl: string, path: string): string {
    const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}${cleanPath}`;
}

export function parseFileProps(xmlString: string) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'text/xml');
    
    return {
        href: doc.getElementsByTagNameNS('DAV:', 'href')[0]?.textContent || '',
        lastModified: doc.getElementsByTagNameNS('DAV:', 'getlastmodified')[0]?.textContent || '',
        contentLength: doc.getElementsByTagNameNS('DAV:', 'getcontentlength')[0]?.textContent || '',
        checksum: doc.getElementsByTagNameNS('DAV:', 'checksum')[0]?.textContent || '',
        displayName: doc.getElementsByTagNameNS('DAV:', 'displayname')[0]?.textContent || ''
    };
}

export async function webdavGet(
    connection: WebDAVConnection, 
    path: string
): Promise<RequestUrlResponse> {
    const url = createFullUrl(connection.baseUrl, path);
    
    return await requestUrl({
        url,
        method: 'GET',
        headers: {
            'Authorization': createAuthHeader(connection.username, connection.password)
        }
    });
}

export async function webdavPropfind(
    connection: WebDAVConnection, 
    path: string,
    depth: '0' | '1' | 'infinity' = '1'
): Promise<RequestUrlResponse> {
    const url = createFullUrl(connection.baseUrl, path);
    
    return await requestUrl({
        url,
        method: 'PROPFIND',
        headers: {
            'Authorization': createAuthHeader(connection.username, connection.password),
            'Depth': depth,
            'Content-Type': 'application/xml'
        },
        body: `<?xml version="1.0" encoding="utf-8" ?>
            <propfind xmlns="DAV:">
                <allprop/>
            </propfind>`
    });
}

export async function webdavPut(
    connection: WebDAVConnection,
    path: string,
    content: string | ArrayBuffer
): Promise<RequestUrlResponse> {
    const url = createFullUrl(connection.baseUrl, path);
    
    return await requestUrl({
        url,
        method: 'PUT',
        headers: {
            'Authorization': createAuthHeader(connection.username, connection.password),
            'Content-Type': content instanceof ArrayBuffer ? 'application/octet-stream' : 'text/plain'
        },
        body: content
    });
}

export async function webdavDelete(
    connection: WebDAVConnection,
    path: string
): Promise<RequestUrlResponse> {
    const url = createFullUrl(connection.baseUrl, path);
    
    return await requestUrl({
        url,
        method: 'DELETE',
        headers: {
            'Authorization': createAuthHeader(connection.username, connection.password)
        }
    });
}

export async function webdavMove(
    connection: WebDAVConnection,
    sourcePath: string,
    destinationPath: string,
    overwrite: boolean = true
): Promise<RequestUrlResponse> {
    const sourceUrl = createFullUrl(connection.baseUrl, sourcePath);
    const destinationUrl = createFullUrl(connection.baseUrl, destinationPath);
    
    return await requestUrl({
        url: sourceUrl,
        method: 'MOVE',
        headers: {
            'Authorization': createAuthHeader(connection.username, connection.password),
            'Destination': destinationUrl,
            'Overwrite': overwrite ? 'T' : 'F'
        }
    });
}

export async function webdavCopy(
    connection: WebDAVConnection,
    sourcePath: string,
    destinationPath: string,
    overwrite: boolean = true
): Promise<RequestUrlResponse> {
    const sourceUrl = createFullUrl(connection.baseUrl, sourcePath);
    const destinationUrl = createFullUrl(connection.baseUrl, destinationPath);
    
    return await requestUrl({
        url: sourceUrl,
        method: 'COPY',
        headers: {
            'Authorization': createAuthHeader(connection.username, connection.password),
            'Destination': destinationUrl,
            'Overwrite': overwrite ? 'T' : 'F'
        }
    });
}

export async function webdavMkcol(
    connection: WebDAVConnection,
    path: string
): Promise<RequestUrlResponse> {
    const url = createFullUrl(connection.baseUrl, path);
    
    return await requestUrl({
        url,
        method: 'MKCOL',
        headers: {
            'Authorization': createAuthHeader(connection.username, connection.password)
        }
    });
}

export async function webdavList(connection: WebDAVConnection, path: string = '/'): Promise<WebDAVResource[]> {
    const response = await webdavPropfind(connection, path, '1');
    return parseWebDAVList(response.text);
}

interface WebDAVResource {
    href: string;
    type: 'file' | 'directory';
    contentLength?: number;
    lastModified?: string;
    contentType?: string;
}

function parseWebDAVList(xmlString: string): WebDAVResource[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'text/xml');
    const responses = doc.getElementsByTagNameNS('DAV:', 'response');
    const resources: WebDAVResource[] = [];

    for (let i = 0; i < responses.length; i++) {
        const response = responses[i];
        const href = response.getElementsByTagNameNS('DAV:', 'href')[0]?.textContent || '';
        const resourcetype = response.getElementsByTagNameNS('DAV:', 'resourcetype')[0];
        const isCollection = resourcetype?.getElementsByTagNameNS('DAV:', 'collection').length > 0;
        
        const resource: WebDAVResource = {
            href,
            type: isCollection ? 'directory' : 'file'
        };

        // Get optional properties
        const contentLength = response.getElementsByTagNameNS('DAV:', 'getcontentlength')[0]?.textContent;
        if (contentLength) {
            resource.contentLength = parseInt(contentLength, 10);
        }

        const lastModified = response.getElementsByTagNameNS('DAV:', 'getlastmodified')[0]?.textContent;
        if (lastModified) {
            resource.lastModified = lastModified;
        }

        const contentType = response.getElementsByTagNameNS('DAV:', 'getcontenttype')[0]?.textContent;
        if (contentType) {
            resource.contentType = contentType;
        }

        resources.push(resource);
    }

    return resources;
}