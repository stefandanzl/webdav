import { DOMParser } from "xmldom";
import { requestUrl, RequestUrlResponse } from "obsidian";
import { WebDAVDirectoryItem } from "./const";

export class WebDAVClient {
    private baseUrl: string;
    private username: string;
    private password: string;
    private headers: string | object | undefined;

    constructor(baseUrl: string, options: { username: string; password: string; headers?: string | object }) {
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
        this.username = options.username;
        this.password = options.password;
        this.headers = options.headers;
    }

    private createAuthHeader(): string {
        // return `Basic ${Buffer.from(`${this.username}:${this.password}`).toString("base64")}`;
        if (typeof btoa === "undefined") {
            throw new Error("btoa is not available in this environment");
        }
        return `Basic ${btoa(`${this.username}:${this.password}`)}`;
    }

    private createFullUrl(path: string): string {
        const cleanPath = path.startsWith("/") ? path : `/${path}`;
        return `${this.baseUrl}${cleanPath}`;
    }

    public parseFileProps(xmlString: string) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlString, "text/xml");

        return {
            href: doc.getElementsByTagNameNS("DAV:", "href")[0]?.textContent || "",
            lastModified: doc.getElementsByTagNameNS("DAV:", "getlastmodified")[0]?.textContent || "",
            contentLength: doc.getElementsByTagNameNS("DAV:", "getcontentlength")[0]?.textContent || "",
            checksum: doc.getElementsByTagNameNS("DAV:", "checksum")[0]?.textContent || "",
            displayName: doc.getElementsByTagNameNS("DAV:", "displayname")[0]?.textContent || "",
        };
    }

    async get(path: string): Promise<{ data: ArrayBuffer; status: number }> {
        const response = await requestUrl({
            url: this.createFullUrl(path),
            method: "GET",
            headers: {
                Authorization: this.createAuthHeader(),
            },
        });
        // if (response.status === 200)
        // if (response.status === 404) {
        //     throw new Error(`File not found: ${path}`);
        // }

        return { data: response.arrayBuffer, status: response.status };
    }

    /**
     * The Depth header is used with methods executed on resources which could potentially have internal members to indicate whether
     * the method is to be applied only to the resource ("Depth: 0"), to the resource and its immediate children, ("Depth: 1"), or
     * the resource and all its progeny ("Depth: infinity").
     * @param path
     * @param depth
     * @returns
     */
    async propfind(path: string, depth: "0" | "1" | "infinity" = "1"): Promise<RequestUrlResponse> {
        return await requestUrl({
            url: this.createFullUrl(path),
            method: "PROPFIND",
            headers: {
                Authorization: this.createAuthHeader(),
                Depth: depth || "0",
                "Content-Type": "application/xml",
            },
            body: `<?xml version="1.0" encoding="utf-8" ?>
                <propfind xmlns="DAV:">
                    <allprop/>
                </propfind>`,
        });
    }

    async exists(path: string): Promise<boolean> {
        try {
            // Use propfind with depth 0 since we only want to check existence
            const response = await this.propfind(path, "0");
            return response.status === 207; // 207 Multi-Status means it exists
        } catch (error) {
            if (error.status === 404) {
                return false;
            }
            // throw error; // Rethrow other errors

            // console.error(error)
            return false;
        }
    }

    async put(path: string, content: string | ArrayBuffer): Promise<boolean> {
        try {
            const response = await requestUrl({
                url: this.createFullUrl(path),
                method: "PUT",
                headers: {
                    Authorization: this.createAuthHeader(),
                    "Content-Type": content instanceof ArrayBuffer ? "application/octet-stream" : "text/plain",
                    // Translate: "f", // Tell WebDAV not to do URL translation
                },
                body: content,
            });
            return response.status === 201;
        } catch (error) {
            return false;
        }
    }

    // async delete(path: string): Promise<boolean> {
    //     const response = await requestUrl({
    //         url: this.createFullUrl(path),
    //         method: "DELETE",
    //         headers: {
    //             Authorization: this.createAuthHeader(),
    //         },
    //     });

    //     return response.status === 204;
    // }

    async delete(path: string): Promise<number> {
        try {
            const response = await requestUrl({
                url: this.createFullUrl(path),
                method: "DELETE",
                headers: {
                    Authorization: this.createAuthHeader(),
                },
            });
            return response.status;
        } catch (error) {
            //console.error(`Delete failed for ${path}:`, error);
            return error.status || 666; // Return error status if available, else 666
        }
    }

    async move(sourcePath: string, destinationPath: string, overwrite = true): Promise<RequestUrlResponse> {
        return await requestUrl({
            url: this.createFullUrl(sourcePath),
            method: "MOVE",
            headers: {
                Authorization: this.createAuthHeader(),
                Destination: this.createFullUrl(destinationPath),
                Overwrite: overwrite ? "T" : "F",
            },
        });
    }

    async copy(sourcePath: string, destinationPath: string, overwrite = true): Promise<RequestUrlResponse> {
        return await requestUrl({
            url: this.createFullUrl(sourcePath),
            method: "COPY",
            headers: {
                Authorization: this.createAuthHeader(),
                Destination: this.createFullUrl(destinationPath),
                Overwrite: overwrite ? "T" : "F",
            },
        });
    }

    async mkcol(path: string): Promise<RequestUrlResponse> {
        return await requestUrl({
            url: this.createFullUrl(path),
            method: "MKCOL",
            headers: {
                Authorization: this.createAuthHeader(),
            },
        });
    }

    async createDirectory(path: string): Promise<boolean> {
        const response = await this.mkcol(path);
        return response.status === 201;
    }

    async getDirectory(path = "/", depth: "0" | "1" | "infinity" = "1"): Promise<WebDAVDirectoryItem[]> {
        const response = await this.propfind(path, depth);
        const parser = new DOMParser();
        const doc = parser.parseFromString(response.text, "text/xml");
        const responses = doc.getElementsByTagNameNS("DAV:", "response");
        const items: WebDAVDirectoryItem[] = [];

        // Get base path from first response (usually the directory itself)
        const firstHref = responses[0]?.getElementsByTagNameNS("DAV:", "href")[0]?.textContent || "";
        const basePath = firstHref.split("/").slice(0, -1).join("/");

        for (let i = 0; i < responses.length; i++) {
            const response = responses[i];
            const prop = response.getElementsByTagNameNS("DAV:", "prop")[0];

            const href = response.getElementsByTagNameNS("DAV:", "href")[0]?.textContent || "";
            // Remove base path from href and clean up path
            let relativePath = href.replace(basePath, "");

            // Clean up the path
            relativePath = relativePath.replace(/^\/+/, "").replace(/\/+/g, "/");

            if (!relativePath || relativePath === "/") {
                continue; // Skip the base directory
            }

            const resourcetype = prop.getElementsByTagNameNS("DAV:", "resourcetype")[0];
            const isCollection = resourcetype?.getElementsByTagNameNS("DAV:", "collection").length > 0;

            // For directories, ensure they end with exactly one slash
            let finalPath = isCollection ? `${relativePath}/` : relativePath;

            finalPath = finalPath.replace(/^\/+/, "").replace(/\/+/g, "/");

            const item: WebDAVDirectoryItem = {
                basename: decodeURIComponent(relativePath.split("/").filter(Boolean).pop() || ""),
                etag: prop.getElementsByTagNameNS("DAV:", "getetag")[0]?.textContent?.replace(/"/g, "") || null,
                filename: decodeURIComponent(finalPath), // Decode the cleaned path
                lastmod: prop.getElementsByTagNameNS("DAV:", "getlastmodified")[0]?.textContent || "",
                mime: prop.getElementsByTagNameNS("DAV:", "getcontenttype")[0]?.textContent || "",
                props: {
                    checksum: prop.getElementsByTagNameNS("DAV:", "checksum")[0]?.textContent || "",
                    displayname: prop.getElementsByTagNameNS("DAV:", "displayname")[0]?.textContent || "",
                    getlastmodified: prop.getElementsByTagNameNS("DAV:", "getlastmodified")[0]?.textContent || "",
                    resourcetype: isCollection ? { collection: "" } : "",
                    // supportedlock: {
                    //     lockentry: {
                    //         lockscope: { exclusive: "" },
                    //         locktype: { write: "" },
                    //     },
                    // },
                },
                size: parseInt(prop.getElementsByTagNameNS("DAV:", "getcontentlength")[0]?.textContent || "0", 10),
                type: isCollection ? "directory" : "file",
            };

            // Add optional properties
            const contentLength = prop.getElementsByTagNameNS("DAV:", "getcontentlength")[0]?.textContent;
            if (contentLength) {
                item.props.getcontentlength = parseInt(contentLength, 10);
            }

            const contentType = prop.getElementsByTagNameNS("DAV:", "getcontenttype")[0]?.textContent;
            if (contentType) {
                item.props.getcontenttype = contentType;
            }

            const etag = prop.getElementsByTagNameNS("DAV:", "getetag")[0]?.textContent;
            if (etag) {
                item.props.getetag = etag.replace(/"/g, ""); // Remove quotes from etag
            }

            // Add checksums object if it exists
            const checksums = prop.getElementsByTagNameNS("http://owncloud.org/ns", "checksums")[0];
            if (checksums) {
                item.props.checksums = {
                    checksum: checksums.getElementsByTagNameNS("http://owncloud.org/ns", "checksum")[0]?.textContent || "",
                };
            }

            items.push(item);
        }

        return items;
    }
}
