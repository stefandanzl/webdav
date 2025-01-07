// tests/webdav.test.ts
import { describe, test, expect, beforeAll, jest } from "@jest/globals";
import { requestUrl } from "obsidian";
import { WebDAVClient } from "../src/webdav";
import * as fs from "fs/promises";
import * as path from "path";
import * as dotenv from "dotenv";

jest.mock("obsidian");

describe("Basic Web request tests", () => {
    test("requestUrl function is called", async () => {
        const response = await requestUrl("https://example-files.online-convert.com/document/txt/example.txt");
        // console.log(response);
        expect(response).toBeDefined();
    });
});

describe("WebDAV Integration Tests", () => {
    let client: WebDAVClient;

    beforeAll(() => {
        // Load environment variables
        dotenv.config();

        // Verify required environment variables
        const requiredEnvVars = ["WEBDAV_URL", "WEBDAV_USER", "WEBDAV_PASS"];
        const missing = requiredEnvVars.filter((envVar) => !process.env[envVar]);

        if (missing.length > 0) {
            throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
        }

        for (const envVar of requiredEnvVars) {
            if (process.env[envVar] == "") {
                throw new Error(`Environment variable ${envVar} is empty`);
            }
        }

        // Create WebDAV client after verification
        client = new WebDAVClient(process.env.WEBDAV_URL as string, {
            username: process.env.WEBDAV_USER as string,
            password: process.env.WEBDAV_PASS as string,
        });
    });

    test("connects to WebDAV server", async () => {
        const response = await client.propfind("/");
        expect(response.status).toBe(207); // MultiStatus response
    });


    test("gets file properties", async () => {
        const testFile = "/test.txt";
        const response = await client.propfind(testFile, "0");

        const properties = client.parseFileProps(response.text);

        expect(response.status).toBe(207);
        expect(response.text).toContain("getcontenttype>");

        // console.log(properties.checksum);
        expect(properties.checksum).toBe("eb1d87f1000a2b26b333742e1a1e64fde659bc5e");
    });

    test("downloads file and compares with local copy", async () => {
        // First, read the local file
        const localFilePath = path.join(__dirname, "fixtures", "test.txt");
        const localContent = await fs.readFile(localFilePath, "utf8");

        // Download the same file from WebDAV
        const response = await client.get("/test.txt");
        // expect(response.status).toBe(200);

        // Compare contents
        const responseText = new TextDecoder().decode(response.data);

        expect(responseText).toBe(localContent);
    });

    // test('uploads and verifies file', async () => {
    //     const testContent = 'Test file content ' + Date.now();
    //     const testPath = `/test-upload-${Date.now()}.txt`;

    //     // Upload file
    //     const uploadResponse = await client.put(testPath, testContent);
    //     expect(uploadResponse.status).toBe(201);

    //     // Verify upload
    //     const downloadResponse = await client.get(testPath);
    //     expect(downloadResponse.status).toBe(200);
    //     expect(downloadResponse.text).toBe(testContent);
    // });

    test("uploads and verifies file", async () => {
        const testContent = "Test file content " + Date.now();
        const testPath = `/test-upload-${Date.now()}.txt`;

        // Upload file
        const uploadResponse = await client.put(testPath, testContent);
        expect(uploadResponse).toBe(true);

        // Verify upload
        const downloadResponse = await client.get(testPath);
        // expect(downloadResponse.status).toBe(200);
        const downloadedContent = new TextDecoder().decode(downloadResponse.data);
        expect(downloadedContent).toBe(testContent);
    });

    test("deletes file and verifies deletion", async () => {
        // First create a file to delete
        const testPath = `/test-delete-${Date.now()}.txt`;
        await client.put(testPath, "Test content");

        // Delete the file
        const deleteResponse = await client.delete(testPath);
        expect(deleteResponse).toBe(true);

        // Verify file is gone by checking for 404 status
        const getResponse = await client.get(testPath);
        expect(getResponse.status).toBe(404);
    });

    test("create directory and verify", async () => {
        const testPath = `/test-dir-${Date.now()}`;
        await client.mkcol(testPath);

        // Verify directory creation
        const response = await client.propfind(testPath);
        expect(response.status).toBe(207);

        // Clean up by deleting the directory
        await client.delete(testPath);
    });

    test("checks if file exists", async () => {
        // First create a test file
        const testPath = `/test-exists-${Date.now()}.txt`;
        await client.put(testPath, "Test content");

        // Check it exists
        const exists = await client.exists(testPath);
        expect(exists).toBe(true);

        // Check non-existent file
        const nonExistentPath = "/this-file-does-not-exist.txt";
        const doesntExist = await client.exists(nonExistentPath);
        expect(doesntExist).toBe(false);

        // Clean up
        await client.delete(testPath);
    });

    test("gets directory contents with correct structure", async () => {
        const contents = await client.getDirectory("/");
        
        // Verify data is an array
        expect(Array.isArray(contents)).toBe(true);
        
        // Check we got some items
        expect(contents.length).toBeGreaterThan(0);
        
        // Test structure of first item
        const firstItem = contents[0];
        expect(firstItem).toMatchObject({
            basename: expect.any(String),
            etag: expect.any(String) || null,
            filename:  expect.any(String),// expect.stringContaining('/'),
            lastmod: expect.any(String),
            mime: expect.any(String),
            size: expect.any(Number),
            type: expect.stringMatching(/^(file|directory)$/),
            props: {
                checksum: expect.any(String),
                displayname: expect.any(String),
                getlastmodified: expect.any(String),
                resourcetype: expect.anything(),  // Can be '' or [Object]
                // supportedlock: expect.any(Object)
            }
        });
    
        // Test for a file
        const testFile = contents.find(item => item.basename === 'test.txt');
        expect(testFile).toBeDefined();
        if (testFile) {
            expect(testFile).toMatchObject({
                type: 'file',
                size: 6,
                props: {
                    getcontentlength: 6,
                    checksum: expect.any(String),
                    getetag: expect.any(String), //stringMatching(/^".*"$/),
                    checksums: expect.any(Object)
                }
            });
        }
    
        // Test for a directory
        const directory = contents.find(item => item.type === 'directory');
        expect(directory).toBeDefined();
        if (directory) {
            expect(directory).toMatchObject({
                size: 0,
                props: {
                    resourcetype: expect.any(Object),
                    checksum: ''
                }
            });
        }
    });

    test("gets directory contents with correct path structure", async () => {
        const contents = await client.getDirectory("/");

        console.log(contents);

        // Verify paths don't include base WebDAV directory
        for (const item of contents) {
            expect(item.filename).not.toContain("/dav/");
            expect(item.filename.startsWith("/")).toBe(false);
        }

        // Test specific file path
        const testFile = contents.find((item) => item.basename === "test.txt");
        expect(testFile).toBeDefined();
        if (testFile) {
            expect(testFile.filename).toBe("test.txt"); // Not '/dav/test.txt'
        }
    });
});
