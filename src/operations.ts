
// import * as fs from 'fs';
// import * as path from 'path';
import {WebDAVClient, createClient } from "webdav";
import * as fsp from 'fs/promises';
// import * as fs from "fs"
// import { join } from "path";
import { dirname } from "path";
// import { PathLike } from "fs";

export const configWebdav = (url: string, username: string, password: string): WebDAVClient =>{
  if(!(url && username && password )){ 
    // console.log("No userdata")
    throw new Error("No userdata");
     }

  const client = createClient(url,{ username, password });
return client
}

export const join = (...args: string[]) => {
  const separator = '/'; // Change this to '\\' for backslash on Windows
  return args.join(separator).replace(/\/\//g, '/');
}

export const emptyObj = (obj: unknown) => {
  if (typeof obj === 'object' && obj !== null){
      return Object.values(obj).length === 0
  } else {
      return true
  }
}

// export const downloadFiles = async (webdavClient: WebDAVClient, filesMap: object, localBasePath: string, remoteBasePath: string, concurrencyLimit = 5) => {
//   if (filesMap == undefined ||Object.keys(filesMap).length === 0) {
//     console.log('Nothing to download.');
//     return
//   }

  

//   if (!filesMap || typeof filesMap !== 'object') {
//     console.error('Invalid filesMap provided.');
//     return;
//   }

//   // Ensure local base path exists
//   try {
//     await fsp.access(localBasePath);
//   } catch (error) {
//     // Local directory does not exist, create it
//     console.error("crating directory localBasePath",localBasePath)
//     await fsp.mkdir(localBasePath, { recursive: true });
//   }

//   // Counter to track concurrent operations
//   let concurrentCount = 0;

//   // Helper function to wait for concurrency limit
//   const waitForConcurrency = async () => {
//     while (concurrentCount >= concurrencyLimit) {
//       await new Promise(resolve => setTimeout(resolve, 100));
//     }
//     concurrentCount++;
//   };

//   // Iterate through file paths concurrently
//   const promises = Object.entries(filesMap).map(async ([filePath, hash]) => {
//     await waitForConcurrency();

//     try {
//       if (filePath.endsWith('/')) {
//         // console.log(`Skipped remote directory: ${filePath}`);

//         const existFile = await app.vault.adapter.exists(filePath)
//       if(!existFile){
//         try {
//         console.log(`Local dir ${filePath} does not exist yet`)
        
//         app.vault.createFolder(filePath)
//         } catch (error){
//           console.error("error creating local directory ",filePath, error)
//         }
//       }

//         return;
//       }

//       // Ensure remote file exists
//       const remotePath = join(remoteBasePath, filePath);
//       const remoteStats = await webdavClient.stat(remotePath).catch(() => null);

//       if (!remoteStats) {
//         console.error(`Remote file not found: ${remotePath}`);
//         return;
//       }
//       const existDir = await app.vault.adapter.exists(dirname(filePath))
//       if(!existDir){
//         console.log("Dir does not exist yet")
//         try {
//         app.vault.createFolder(dirname(filePath))
//         } catch (error){
//           console.error("Error creating folder",error, filePath)
//         }
//       }
//       // Download the file
//       const localFilePath = join(localBasePath, filePath);
//       // @ts-ignore
//       const fileData = Buffer.from(await webdavClient.getFileContents(remotePath));

//       console.log("Trying to create: ", filePath, " Len: ", fileData.length);
//       await app.vault.adapter.writeBinary(filePath, fileData);

//       console.log(`Downloaded: ${remotePath} to ${localFilePath}`);
//     } finally {
//       // Release the concurrency lock
//       concurrentCount--;
//     }
//   });

//   // Wait for all downloads to complete
//   await Promise.all(promises);
// };

export const downloadFiles = async (webdavClient: WebDAVClient, filesMap: object, localBasePath: string, remoteBasePath: string) => {
  if (filesMap == undefined || Object.keys(filesMap).length === 0) {
    console.log('Nothing to download.');
    return;
  }

  if (!filesMap || typeof filesMap !== 'object') {
    console.error('Invalid filesMap provided.');
    return;
  }

  // Ensure local base path exists
  try {
    await fsp.access(localBasePath);
  } catch (error) {
    // Local directory does not exist, create it
    console.error("creating directory localBasePath", localBasePath);
    await fsp.mkdir(localBasePath, { recursive: true });
  }

  try {
    // Use Promise.all to wait for all asynchronous operations
    await Promise.all(
      Object.entries(filesMap).map(async ([filePath, hash]) => {
        try {
          if (filePath.endsWith('/')) {
            // Skipped remote directory
            const existFile = await app.vault.adapter.exists(filePath);
            if (!existFile) {
              console.log(`Local dir ${filePath} does not exist yet`);
              await app.vault.createFolder(filePath);
            }
            return;
          }

          // Ensure remote file exists
          const remotePath = join(remoteBasePath, filePath);
          const remoteStats = await webdavClient.stat(remotePath).catch(() => null);

          if (!remoteStats) {
            console.error(`Remote file not found: ${remotePath}`);
            return;
          }

          // Ensure parent directory exists
          const existDir = await app.vault.adapter.exists(dirname(filePath));
          if (!existDir) {
            console.log("Dir does not exist yet");
            await app.vault.createFolder(dirname(filePath));
          }

          // Download the file
          const localFilePath = join(localBasePath, filePath);
          // @ts-ignore
          const fileData: Buffer = await webdavClient.getFileContents(remotePath,{format: "binary"});

          // const fileDataBuffer = Buffer.from(fileData, {format:})

          console.log("Trying to create: ", filePath)//, " Len: ", fileData.length);
          await app.vault.adapter.writeBinary(filePath, fileData);

          console.log(`Downloaded: ${remotePath} to ${localFilePath}`);
        } catch (error) {
          console.error("Error in downloadFiles:", error);
          // Handle errors here
        }
      })
    );
  } catch (error) {
    console.error("DownloadFiles Error", error);
  }
};


export const uploadFiles = async (webDavClient: WebDAVClient, fileChecksums: object | undefined, localBasePath: string, remoteBasePath: string) => {
  if (fileChecksums == undefined ||Object.keys(fileChecksums).length === 0) {
    console.log('No files to upload.');
    return
  }
  try {
    // Iterate over the file paths and checksums
    
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const [localFilePath, checksum] of Object.entries(fileChecksums)) {

      if (localFilePath.endsWith('/')) {
        
        try {
          console.log(`Creating remote directory: ${localFilePath}`);
          webDavClient.createDirectory(join(remoteBasePath, localFilePath.replace(/\/$/, '')))


        } catch (error){
          console.error("Error creating webdav directory",localFilePath, error)
        }
        continue;
      }

      try {
      // Construct the full local file path
      const fullPath = join(localBasePath, localFilePath);

      // Read the local file content
      const fileContent = await fsp.readFile(fullPath);

      // Construct the remote file path
      const remoteFilePath = join(remoteBasePath, localFilePath);
      console.log(remoteFilePath)

      // Upload the file to WebDAV
      await webDavClient.putFileContents(remoteFilePath, fileContent);

      console.log(`Uploaded: ${localFilePath} to ${remoteFilePath}`);
      } catch (error){
        console.error("uploadFiles putFileContents Error: ",error, localFilePath)
      }
    }

    console.log('All files uploaded successfully.');
  } catch (error) {
    console.error('Upload failed:', error.message);
    
  }
}

export const deleteFilesWebdav = async(client: WebDAVClient, basePath: string ,fileTree: object | undefined) => {
  if ( fileTree == undefined || Object.keys(fileTree).length === 0 ) {
    console.log('The object is empty.');
    return
  }
  
  for (const file in fileTree){
  // webdav - delete
  try {
    if (file.endsWith('/')){
      const path = file.replace(/\/$/, '');
      // const stat = await client.stat(path);

    // if (stat.type === "directory") {
    //   // If it's a directory, delete its contents first
    //   const children = await client.getDirectoryContents(path);
    //   await Promise.all(children.map(child => deleteItem(child.filename)));
    // }

    // Delete the item (file or directory)
    await client.deleteFile(join(basePath,path));
    console.log(`Deleted: ${path}`);
    } else {
    // Iterate through remote file paths and delete each file
    // await Promise.all(remoteFilePaths.map(async remoteFilePath => {
      client.deleteFile(join(basePath,file)).then(()=>{
        console.log(`File deleted successfully: ${file}`);
      });
    }
      
    // }));

  } catch (error) {
    console.error(`Error deleting files: ${error.message}`, file);  // previously error
  }
}
}



export const deleteFilesLocal = async(fileTree: object | undefined) => {
  if (fileTree == undefined ||Object.keys(fileTree).length === 0) {
    console.log('The object is empty.');
    return
  }
  
  // console.log(fileTree.length, " files to delete")
  for (const file in fileTree){
    try {
      // if (file.endsWith("/")){
      //   app.vault.adapter.trashSystem(file).then(()=>{console.log("deleted ",file)})
      // } else {
      app.vault.adapter.trashSystem(file).then(()=>{console.log("deleted ",file)})
      // }
    } catch { 
      console.error("deletion error",file)
    }
  }
}


