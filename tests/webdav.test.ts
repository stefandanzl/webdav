/* eslint-disable @typescript-eslint/no-unused-vars */
// tests/webdav.test.ts
import { describe, test, expect, beforeAll, jest, xtest, xdescribe,  } from '@jest/globals';
import { requestUrl } from 'obsidian';
import { webdavGet, webdavPropfind, webdavPut, webdavDelete, WebDAVConnection, parseFileProps, webdavMkcol } from '../src/webdav';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { DOMParser } from 'xmldom';

jest.mock('obsidian');

describe('Basic Web request tests', () => {
    test('requestUrl function is called', async () => {
    const response = await requestUrl("https://example-files.online-convert.com/document/txt/example.txt");
    console.log(response);
    expect(response).toBeDefined();
    });
});

describe('WebDAV Integration Tests', () => {
    let connection: WebDAVConnection;

    beforeAll(() => {
        // Load environment variables
        dotenv.config();
        
        // Verify required environment variables
        const requiredEnvVars = ['WEBDAV_URL', 'WEBDAV_USER', 'WEBDAV_PASS'];
        const missing = requiredEnvVars.filter(envVar => !process.env[envVar]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
        }
    
        // Only create connection after verification
        connection = {
            baseUrl: process.env.WEBDAV_URL!,  // TypeScript non-null assertion is safe here because we checked above
            username: process.env.WEBDAV_USER!,
            password: process.env.WEBDAV_PASS!
        };
    });

    

    test('connects to WebDAV server', async () => {
        const response = await webdavPropfind(connection, '/');
        expect(response.status).toBe(207); // MultiStatus response
    });

    test('lists directory contents', async () => {
        const response = await webdavPropfind(connection, '/');
        expect(response.status).toBe(207);
        
        // Extract just the paths from the XML
        const parser = new DOMParser();
        const doc = parser.parseFromString(response.text, 'text/xml');
        const paths = Array.from(doc.getElementsByTagNameNS('DAV:', 'href'))
            .map(el => el.textContent || '')
            .sort();
    
        // console.log('Found paths:', paths);
    
        // // Compare with expected paths
        // const expectedPaths = [
        //     '/dav/',
        //     '/dav/dev3/'
        // ].sort();
    
        // expect(paths).toEqual(expectedPaths);

        expect(paths).toContain('/dav/');
    });

    test('gets file properties', async () => {
        // Assuming there's a known file in your WebDAV
        const testFile = '/test.txt';
        const response = await webdavPropfind(connection, testFile, '0');

        const properties = parseFileProps(response.text);
        
        expect(response.status).toBe(207);
        // Check for specific properties in the XML response
        expect(response.text).toContain('getcontenttype>');

        console.log(properties.checksum)
        expect(properties.checksum).toBe('eb1d87f1000a2b26b333742e1a1e64fde659bc5e');
    });

    test('downloads file and compares with local copy', async () => {
        // First, read the local file
        const localFilePath = path.join(__dirname, 'fixtures', 'test.txt');
        const localContent = await fs.readFile(localFilePath, 'utf8');

        // Download the same file from WebDAV
        const response = await webdavGet(connection, '/test.txt');
        expect(response.status).toBe(200);
        
        // Compare contents
        expect(response.text).toBe(localContent);
    });

    test('uploads and verifies file', async () => {
        const testContent = 'Test file content ' + Date.now();
        const testPath = `/test-upload-${Date.now()}.txt`;

        // Upload file
        const uploadResponse = await webdavPut(connection, testPath, testContent);
        expect(uploadResponse.status).toBe(201);

        // Verify upload
        const downloadResponse = await webdavGet(connection, testPath);
        expect(downloadResponse.status).toBe(200);
        expect(downloadResponse.text).toBe(testContent);
    });

    test('deletes file and verifies deletion', async () => {
        // First create a file to delete
        const testPath = `/test-delete-${Date.now()}.txt`;
        await webdavPut(connection, testPath, 'Test content');
    
        // Delete the file
        const deleteResponse = await webdavDelete(connection, testPath);
        expect(deleteResponse.status).toBe(204);
    
        // Verify file is gone by checking for 404 status
        const getResponse = await webdavGet(connection, testPath);
        expect(getResponse.status).toBe(404);
    });

    test('create directory and verify', async () => {

        const testPath = `/test-dir-${Date.now()}`;
        await webdavMkcol(connection, testPath);

        // Verify directory creation
        const response = await webdavPropfind(connection, testPath);

        expect(response.status).toBe(207);

        // // Verify the directory is a collection
        // const properties = parseFileProps(response.text);
        // expect(properties.type).toBe('directory');

        // Clean up by deleting the directory
        await webdavDelete(connection, testPath);
    });



});