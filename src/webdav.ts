/* eslint-disable @typescript-eslint/no-inferrable-types */
// @ts-nocheck
import { DOMParser } from 'xmldom';
import { requestUrl, RequestUrlResponse } from 'obsidian';

export interface WebDAVResource {
    href: string;
    type: 'file' | 'directory';
    contentLength?: number;
    lastModified?: string;
    contentType?: string;
}

export type MethodOptions = {
    data: string | ArrayBuffer;
    headers: string;

}

export class WebDAVClient {
    private baseUrl: string;
    private username: string;
    private password: string;

    constructor(baseUrl: string, options: { username: string, password: string, headers: string}) {
        this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        this.username = options.username;
        this.password = options.password;
        this.headers = options.headers;
    }

    private createAuthHeader(): string {
        return `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`;
    }

    private createFullUrl(path: string): string {
        const cleanPath = path.startsWith('/') ? path : `/${path}`;
        return `${this.baseUrl}${cleanPath}`;
    }

    public parseFileProps(xmlString: string) {
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

    async getFileContents(path: string, format?: "text" | "binary"): Promise<RequestUrlResponse> {
        format = format || 'text';
        return await requestUrl({
            url: this.createFullUrl(path),
            method: 'GET',
            headers: {
                'Authorization': this.createAuthHeader()
            }
        });
    }

    async propfind(path: string, depth?: '0' | 'infinity' = '1'): Promise<RequestUrlResponse> {
        return await requestUrl({
            url: this.createFullUrl(path),
            method: 'PROPFIND',
            headers: {
                'Authorization': this.createAuthHeader(),
                'Depth': depth || '0',
                'Content-Type': 'application/xml'
            },
            body: `<?xml version="1.0" encoding="utf-8" ?>
                <propfind xmlns="DAV:">
                    <allprop/>
                </propfind>`
        });
    }


    async put(path: string, content: string | ArrayBuffer): Promise<RequestUrlResponse> {
        return await requestUrl({
            url: this.createFullUrl(path),
            method: 'PUT',
            headers: {
                'Authorization': this.createAuthHeader(),
                'Content-Type': content instanceof ArrayBuffer ? 'application/octet-stream' : 'text/plain'
            },
            body: content
        });
    }

    async delete(path: string): Promise<RequestUrlResponse> {
        return await requestUrl({
            url: this.createFullUrl(path),
            method: 'DELETE',
            headers: {
                'Authorization': this.createAuthHeader()
            }
        });
    }

    async move(sourcePath: string, destinationPath: string, overwrite: boolean = true): Promise<RequestUrlResponse> {
        return await requestUrl({
            url: this.createFullUrl(sourcePath),
            method: 'MOVE',
            headers: {
                'Authorization': this.createAuthHeader(),
                'Destination': this.createFullUrl(destinationPath),
                'Overwrite': overwrite ? 'T' : 'F'
            }
        });
    }

    async copy(sourcePath: string, destinationPath: string, overwrite: boolean = true): Promise<RequestUrlResponse> {
        return await requestUrl({
            url: this.createFullUrl(sourcePath),
            method: 'COPY',
            headers: {
                'Authorization': this.createAuthHeader(),
                'Destination': this.createFullUrl(destinationPath),
                'Overwrite': overwrite ? 'T' : 'F'
            }
        });
    }

    async mkcol(path: string): Promise<RequestUrlResponse> {
        return await requestUrl({
            url: this.createFullUrl(path),
            method: 'MKCOL',
            headers: {
                'Authorization': this.createAuthHeader()
            }
        });
    }

    async list(path: string = '/'): Promise<WebDAVResource[]> {
        const response = await this.propfind(path, '1');
        return this.parseWebDAVList(response.text);
    }

    private parseWebDAVList(xmlString: string): WebDAVResource[] {
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
}