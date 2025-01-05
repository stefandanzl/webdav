// test all functions in request.ts

const connection: WebDAVConnection = {
    baseUrl: 'https://webdav.server.com',
    username: 'user',
    password: 'pass',
    defaultHeaders: {
        'User-Agent': 'MyWebDAVClient/1.0'
    }
};

async function example() {
    try {
        // Create a directory
        await webdavMkcol(connection, '/newdir');
        
        // Upload a file
        await webdavPut(connection, '/newdir/file.txt', 'Hello WebDAV!');
        
        // Get file properties
        const props = await webdavPropfind(connection, '/newdir/file.txt', '0');
        
        // Move the file
        await webdavMove(connection, '/newdir/file.txt', '/newdir/moved.txt');
        
    } catch (error) {
        console.error('WebDAV operation failed:', error);
    }
}