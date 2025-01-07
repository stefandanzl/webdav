import Cloudr from "./main";
import { WebDAVClient } from "./webdav";
import { join, dirname, log } from "./util";
import { normalizePath } from "obsidian";
import { Controller, FileList, Status } from "./const";

const WEBDAV_HEADERS = { "Cache-Control": "no-cache, no-store, must-revalidate" };

export class Operations {
    constructor(public plugin: Cloudr) {
        this.plugin = plugin;
    }

    /**
     * Configure and create WebDAV client
     */
    configWebdav(url: string, username: string, password: string): WebDAVClient {
        if (!(url && username && password)) {
            throw new Error("Missing WebDAV configuration parameters");
        }

        return new WebDAVClient(url, {
            username,
            password,
            headers: WEBDAV_HEADERS,
        });
    }

    /**
     * Download files from WebDAV server
     */
    async downloadFiles(webdavClient: WebDAVClient, filesMap: FileList, remoteBasePath: string): Promise<void> {
        if (!filesMap || Object.keys(filesMap).length === 0) {
            console.log("No files to download");
            return;
        }

        await Promise.all(Object.entries(filesMap).map(([filePath, _]) => this.downloadFile(webdavClient, filePath, remoteBasePath)));
    }

    /**
     * Download a single file from WebDAV
     */
    private async downloadFile(webdavClient: WebDAVClient, filePath: string, remoteBasePath: string): Promise<void> {
        try {
            if (filePath.endsWith("/")) {
                await this.ensureLocalDirectory(filePath);
                return;
            }

            const remotePath = join(remoteBasePath, filePath);

            // Verify remote file exists
            const remoteStats = await webdavClient.exists(remotePath);
            if (!remoteStats) {
                console.error(`Remote file not found: ${remotePath}`);
                return;
            }

            // Ensure local directory exists
            await this.ensureLocalDirectory(dirname(filePath));

            // Download with retry
            const fileData = await this.downloadWithRetry(webdavClient, remotePath);
            if (fileData.status !== 200) {
                throw new Error(`Failed to download ${remotePath}: ${fileData.status}`);
            }
            await this.plugin.app.vault.adapter.writeBinary(filePath, fileData.data);
            this.plugin.processed();
            // console.log(`Downloaded: ${remotePath}`);
        } catch (error) {
            console.error(`Error downloading ${filePath}:`, error);
        }
    }

    /**
     * Upload files to WebDAV server
     */
    async uploadFiles(webdavClient: WebDAVClient, fileChecksums: FileList, remoteBasePath: string): Promise<void> {
        if (!fileChecksums || Object.keys(fileChecksums).length === 0) {
            console.log("No files to upload");
            return;
        }

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for (const [localFilePath, _] of Object.entries(fileChecksums)) {
            await this.uploadFile(webdavClient, localFilePath, remoteBasePath);
        }

        console.log("Upload completed");
    }

    /**
     * Upload a single file to WebDAV
     */
    private async uploadFile(webdavClient: WebDAVClient, localFilePath: string, remoteBasePath: string): Promise<void> {
        try {
            if (localFilePath.endsWith("/")) {
                await this.ensureRemoteDirectory(webdavClient, localFilePath, remoteBasePath);
                return;
            }

            const fileContent = await this.plugin.app.vault.adapter.readBinary(normalizePath(localFilePath));
            const remoteFilePath = join(remoteBasePath, localFilePath);

            await webdavClient.put(remoteFilePath, fileContent);
            this.plugin.processed();
            log(`Uploaded: ${localFilePath} to ${remoteFilePath}`);
        } catch (error) {
            console.error(`Error uploading ${localFilePath}:`, error);
        }
    }

    /**
     * Delete files from WebDAV server
     */
    async deleteFilesWebdav(client: WebDAVClient, basePath: string, fileTree: FileList): Promise<void> {
      if (!fileTree || Object.keys(fileTree).length === 0) {
          console.log("No files to delete on WebDAV");
          return;
      }
  
      const failedPaths: string[] = [];
  
      const deleteFile = async (path: string): Promise<void> => {
          const cleanPath = path.endsWith("/") ? path.replace(/\/$/, "") : path;
          const fullPath = join(basePath, cleanPath);
  
          try {
              const response = await client.delete(fullPath);
              // console.log(response, typeof response)
              //
              if (response !== 204 && response !== 404) {
                console.log(fullPath, " Errorstatus: ",response)
                  failedPaths.push(fullPath);
                  return;
              }
              this.plugin.processed();
          } catch (error) {
              console.error(`Delete failed for ${cleanPath}:`, error);
              failedPaths.push(fullPath);
          }
      };
  
      const retryDelete = async (path: string): Promise<void> => {
          try {
              if (await client.exists(path)) {
                  const response = await client.delete(path);
                  if (response) {
                      this.plugin.processed();
                      console.log(`Retry successful: ${path}`);
                  }
              } else {
                  console.log(`File already deleted or doesn't exist: ${path}`);
                  this.plugin.processed();
              }
          } catch (error) {
              console.error(`Final delete attempt failed for ${path}:`, error);
          }
      };
  
      // First attempt for all files
      await Promise.all(Object.keys(fileTree).map(deleteFile));
  
      // Retry failed deletions
      if (failedPaths.length > 0) {
          console.log(`Retrying ${failedPaths.length} failed deletions...`);
          await Promise.all(failedPaths.map(retryDelete));
      }
  }

    /**
     * Delete files from local storage
     */
    async deleteFilesLocal(fileTree: FileList): Promise<void> {
        if (!fileTree || Object.keys(fileTree).length === 0) {
            console.log("No files to delete locally");
            return;
        }

        for (const file of Object.keys(fileTree)) {
            await this.deleteLocalFile(file);
        }
    }

    // Helper methods
    private async downloadWithRetry(
        webdavClient: WebDAVClient,
        remotePath: string,
        maxRetries = 2
    ): Promise<{
        data: ArrayBuffer;
        status: number;
    }> {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                // return await webdavClient.getFileContents(remotePath, {
                //     format: "binary"
                // });
                return await webdavClient.get(remotePath);
            } catch (error) {
                if (attempt === maxRetries) throw error;
                console.log(`Retry ${attempt} for ${remotePath}`);
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
        }
        throw new Error(`Failed to download after ${maxRetries} attempts`);
    }

    private async ensureLocalDirectory(path: string): Promise<void> {
        const exists = await this.plugin.app.vault.adapter.exists(path);
        if (!exists) {
            console.log(`Creating local directory: ${path}`);
            await this.plugin.app.vault.createFolder(path);
        }
    }

    private async ensureRemoteDirectory(webdavClient: WebDAVClient, path: string, basePath: string): Promise<void> {
        try {
            console.log(`Creating remote directory: ${path}`);
            const response = await webdavClient.createDirectory(join(basePath, path.replace(/\/$/, "")));
            if (!response) {
                throw new Error(`Failed to create remote directory ${path}`);
            }
            this.plugin.processed();
        } catch (error) {
            console.error(`Error creating remote directory ${path}:`, error);
        }
    }

    private async deleteLocalFile(file: string): Promise<void> {
        try {
            if (this.plugin.mobile) {
                await this.plugin.app.vault.adapter.trashLocal(file);
            } else {
                await this.plugin.app.vault.adapter.trashSystem(file);
            }
            // console.log(`Deleted locally: ${file}`);
            this.plugin.processed();
        } catch (error) {
            console.error(`Error deleting local file ${file}:`, error);
        }
    }

    async sync(controller: Controller, button = true) {
        if (this.plugin.prevData.error) {
            const action = "sync";
            if (this.plugin.force !== action) {
                this.plugin.setForce(action);
                button && this.plugin.show("Error detected - please clear in control panel or force action by retriggering " + action);
                return;
            }
        }

        if (this.plugin.status !== Status.NONE) {
            button && this.plugin.show(`Operation not possible, currently working on '${this.plugin.status}'`);
            return;
        }

        try {
            if (!(await this.plugin.test(false))) {
                button && this.plugin.show("Connection Problem detected!");
                return;
            }

            if (!this.plugin.fileTrees) {
                button && this.plugin.show("Checking files before operation...");
                await this.check();
            }

            this.plugin.setStatus(Status.SYNC);

            // Calculate total operations needed
            const operationsToCount = [];

            if (controller.webdav) {
                if (controller.webdav.added) operationsToCount.push(this.plugin.fileTrees.webdavFiles.added);
                if (controller.webdav.modified) operationsToCount.push(this.plugin.fileTrees.webdavFiles.modified);
                if (controller.webdav.deleted) operationsToCount.push(this.plugin.fileTrees.webdavFiles.deleted);
                if (controller.webdav.except) operationsToCount.push(this.plugin.fileTrees.webdavFiles.except);
            }

            if (controller.local) {
                if (controller.local.added) operationsToCount.push(this.plugin.fileTrees.localFiles.added);
                if (controller.local.modified) operationsToCount.push(this.plugin.fileTrees.localFiles.modified);
                if (controller.local.deleted) operationsToCount.push(this.plugin.fileTrees.localFiles.deleted);
                if (controller.local.except) operationsToCount.push(this.plugin.fileTrees.localFiles.except);
            }

            this.plugin.calcTotal(...operationsToCount.filter(Boolean));

            button && this.plugin.show("Synchronizing...");

            const operations: Promise<void>[] = [];

            // Handle WebDAV operations
            if (controller.webdav) {
                if (controller.webdav.added === 1) {
                    operations.push(
                        this.plugin.operations.downloadFiles(
                            this.plugin.webdavClient,
                            this.plugin.fileTrees.webdavFiles.added,
                            this.plugin.baseWebdav
                        )
                    );
                } else if (controller.webdav.added === -1) {
                    operations.push(
                        this.plugin.operations.deleteFilesWebdav(
                            this.plugin.webdavClient,
                            this.plugin.baseWebdav,
                            this.plugin.fileTrees.webdavFiles.added
                        )
                    );
                }

                if (controller.webdav.deleted === 1) {
                    operations.push(this.plugin.operations.deleteFilesLocal(this.plugin.fileTrees.webdavFiles.deleted));
                } else if (controller.webdav.deleted === -1) {
                    operations.push(
                        this.plugin.operations.downloadFiles(
                            this.plugin.webdavClient,
                            this.plugin.fileTrees.webdavFiles.deleted,
                            this.plugin.baseWebdav
                        )
                    );
                }

                if (controller.webdav.modified === 1) {
                    operations.push(
                        this.plugin.operations.downloadFiles(
                            this.plugin.webdavClient,
                            this.plugin.fileTrees.webdavFiles.modified,
                            this.plugin.baseWebdav
                        )
                    );
                }

                if (controller.webdav.except === 1) {
                    operations.push(
                        this.plugin.operations.downloadFiles(
                            this.plugin.webdavClient,
                            this.plugin.fileTrees.webdavFiles.except,
                            this.plugin.baseWebdav
                        )
                    );
                }
            }

            // Handle Local operations
            if (controller.local) {
                if (controller.local.added === 1) {
                    operations.push(
                        this.plugin.operations.uploadFiles(
                            this.plugin.webdavClient,
                            this.plugin.fileTrees.localFiles.added,
                            this.plugin.baseWebdav
                        )
                    );
                } else if (controller.local.added === -1) {
                    operations.push(this.plugin.operations.deleteFilesLocal(this.plugin.fileTrees.localFiles.added));
                }

                if (controller.local.deleted === 1) {
                    operations.push(
                        this.plugin.operations.deleteFilesWebdav(
                            this.plugin.webdavClient,
                            this.plugin.baseWebdav,
                            this.plugin.fileTrees.localFiles.deleted
                        )
                    );
                } else if (controller.local.deleted === -1) {
                    operations.push(
                        this.plugin.operations.uploadFiles(
                            this.plugin.webdavClient,
                            this.plugin.fileTrees.localFiles.deleted,
                            this.plugin.baseWebdav
                        )
                    );
                }

                if (controller.local.modified === 1) {
                    operations.push(
                        this.plugin.operations.uploadFiles(
                            this.plugin.webdavClient,
                            this.plugin.fileTrees.localFiles.modified,
                            this.plugin.baseWebdav
                        )
                    );
                }

                if (controller.local.except === 1) {
                    operations.push(
                        this.plugin.operations.uploadFiles(
                            this.plugin.webdavClient,
                            this.plugin.fileTrees.localFiles.except,
                            this.plugin.baseWebdav
                        )
                    );
                }
            }

            // Execute all operations concurrently
            await Promise.all(operations);

            button && this.plugin.show("Sync completed - checking again");
            await this.check(true, true);
            await this.plugin.saveState();
            button && this.plugin.show("Done");
        } catch (error) {
            console.error("SYNC", error);
            button && this.plugin.show("SYNC Error: " + error);
            this.plugin.setError(true);
            this.plugin.setStatus(Status.ERROR)
        } finally {
            
          // @ts-ignore
          if (this.plugin.status !== Status.ERROR) {
            this.plugin.setStatus(Status.NONE)//Status.OK); war eigentlich so
        }
            this.plugin.finished();
        }
    }



async check(show = true, force = false) {
  if (!force && this.plugin.status !== Status.NONE) {
      show && this.plugin.show(`Checking not possible, currently ${this.plugin.status}`);
      return;
  }

  this.plugin.setStatus(Status.CHECK);
  show && this.plugin.show(`${Status.CHECK} Checking ...`);

  try {
      const response = await this.plugin.test(false);
      if (!response) {
          throw new Error("Testing failed, can't continue Check action!");
      }

      this.plugin.checkTime = Date.now();

      const webdavPromise = this.plugin.checksum.generateWebdavHashTree(
          this.plugin.webdavClient,
          this.plugin.baseWebdav,
          this.plugin.settings.exclusions
      );
      const localPromise = this.plugin.checksum.generateLocalHashTree(true);

      const [webdavFiles, localFiles] = await Promise.all([webdavPromise, localPromise]);

      log("WEBDAV:", webdavFiles);
      log("LOCAL", JSON.stringify(localFiles, null, 2));

      const comparedFileTrees = await this.plugin.compare.compareFileTrees(
          webdavFiles,
          localFiles,
          this.plugin.prevData,
          this.plugin.settings.exclusions
      );
      log(JSON.stringify(comparedFileTrees, null, 2));
      this.plugin.fileTrees = comparedFileTrees;

      show && (this.plugin.fileTreesEmpty() ? null : this.plugin.show("Finished checking files"));
      return true;
  } catch (error) {
      console.error("CHECK ERROR: ", error);
      show && this.plugin.show("CHECK ERROR: " + error);
      this.plugin.setError(true);
      this.plugin.setStatus(Status.ERROR);
      throw error;
  } finally {
      if (this.plugin.status !== Status.ERROR) {
          this.plugin.setStatus(Status.NONE);
      }
  }
}


}