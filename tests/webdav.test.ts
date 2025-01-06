// tests/webdav.test.ts
import { describe, test, expect, beforeAll, jest } from '@jest/globals';
import { requestUrl } from 'obsidian';
import { WebDAVClient } from '../src/webdav';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as dotenv from 'dotenv';

jest.mock('obsidian');

describe('Basic Web request tests', () => {
    test('requestUrl function is called', async () => {
        const response = await requestUrl("https://example-files.online-convert.com/document/txt/example.txt");
        console.log(response);
        expect(response).toBeDefined();
    });
});

describe('WebDAV Integration Tests', () => {
    let client: WebDAVClient;

    beforeAll(() => {
        // Load environment variables
        dotenv.config();
        
        // Verify required environment variables
        const requiredEnvVars = ['WEBDAV_URL', 'WEBDAV_USER', 'WEBDAV_PASS'];
        const missing = requiredEnvVars.filter(envVar => !process.env[envVar]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
        }
    
        // Create WebDAV client after verification
        client = new WebDAVClient(
            process.env.WEBDAV_URL!,
            process.env.WEBDAV_USER!,
            process.env.WEBDAV_PASS!
        );
    });

    test('connects to WebDAV server', async () => {
        const response = await client.propfind('/');
        expect(response.status).toBe(207); // MultiStatus response
    });

    test('lists directory contents', async () => {
        const response = await client.propfind('/');
        expect(response.status).toBe(207);
        
        const resources = await client.list('/');
        const paths = resources.map(r => r.href).sort();
    
        expect(paths).toContain('/dav/');
    });

    test('gets file properties', async () => {
        const testFile = '/test.txt';
        const response = await client.propfind(testFile, '0');
        
        const properties = client.parseFileProps(response.text);
        
        expect(response.status).toBe(207);
        expect(response.text).toContain('getcontenttype>');

        console.log(properties.checksum);
        expect(properties.checksum).toBe('eb1d87f1000a2b26b333742e1a1e64fde659bc5e');
    });

    test('downloads file and compares with local copy', async () => {
        // First, read the local file
        const localFilePath = path.join(__dirname, 'fixtures', 'test.txt');
        const localContent = await fs.readFile(localFilePath, 'utf8');

        // Download the same file from WebDAV
        const response = await client.get('/test.txt');
        expect(response.status).toBe(200);
        
        // Compare contents
        expect(response.text).toBe(localContent);
    });

    test('uploads and verifies file', async () => {
        const testContent = 'Test file content ' + Date.now();
        const testPath = `/test-upload-${Date.now()}.txt`;

        // Upload file
        const uploadResponse = await client.put(testPath, testContent);
        expect(uploadResponse.status).toBe(201);

        // Verify upload
        const downloadResponse = await client.get(testPath);
        expect(downloadResponse.status).toBe(200);
        expect(downloadResponse.text).toBe(testContent);
    });

    test('deletes file and verifies deletion', async () => {
        // First create a file to delete
        const testPath = `/test-delete-${Date.now()}.txt`;
        await client.put(testPath, 'Test content');
    
        // Delete the file
        const deleteResponse = await client.delete(testPath);
        expect(deleteResponse.status).toBe(204);
    
        // Verify file is gone by checking for 404 status
        const getResponse = await client.get(testPath);
        expect(getResponse.status).toBe(404);
    });

    test('create directory and verify', async () => {
        const testPath = `/test-dir-${Date.now()}`;
        await client.mkcol(testPath);

        // Verify directory creation
        const response = await client.propfind(testPath);
        expect(response.status).toBe(207);

        // Clean up by deleting the directory
        await client.delete(testPath);
    });
});