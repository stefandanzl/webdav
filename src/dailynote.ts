import { TFile, moment, normalizePath } from "obsidian";
import Cloudr from "./main";
import { createFolderIfNotExists } from "./util";
import { Status } from "./const";

export class DailyNoteManager {
    private ignoreConnection: boolean;

    constructor(private plugin: Cloudr) {
        this.plugin = plugin;
        this.ignoreConnection = false;
    }

    /**
     * Creates or updates a daily note, comparing local and remote content
     */
    async getDailyNote(filePath: string, remoteContent: string | undefined): Promise<[file: TFile, usedTemplate?: boolean]> {
        let finalContent = "";
        let usedTemplate = false;

        // Check if file exists locally
        const existingFile = this.plugin.app.vault.getAbstractFileByPath(filePath);
        if (existingFile instanceof TFile) {
            const localContent = await this.plugin.app.vault.read(existingFile);

            // Use remote content if it's longer, otherwise keep local
            // if (remoteContent && remoteContent.length > localContent.length) {
            if (localContent === remoteContent) {
                return [existingFile];
            }
            if (remoteContent !== undefined) {
                this.plugin.show("Modified Daily Note from the one on Webdav");
                finalContent = remoteContent;
                // Update existing file instead of creating new one
                await this.plugin.app.vault.modify(existingFile, finalContent);
                return [existingFile];
            } else {
                return [existingFile];
            }
        }

        // If file doesn't exist, use remote content or template
        // finalContent = remoteContent || (await this.getTemplateContent());

        try {
            if (remoteContent) {
                finalContent = remoteContent;
                this.plugin.show("Fetching Daily Note from remote content");
            } else {
                const templateContent = await this.getTemplateContent();
                if (templateContent === undefined) {
                    throw new Error("Template File Error");
                }
                finalContent = templateContent;
                usedTemplate = true;
                this.plugin.show("Creating new Daily Note with template");
            }
            const file = await this.plugin.app.vault.create(filePath, finalContent);
            return [file, usedTemplate];
        } catch (err) {
            this.plugin.show("Daily Note File Error: ", err);

            console.error(`Failed to create daily note at '${filePath}':`, err);
            throw new Error(`Failed to create daily note: ${err.message}`);
        }
    }

    /**
     * Gets template content if specified
     */
    private async getTemplateContent(): Promise<string | undefined> {
        // const templatePath = this.plugin.settings.dailyNotesFolder;
        let templatePath = this.plugin.settings.dailyNotesTemplate;
        if (!templatePath) {
            this.plugin.show("Error: No template path for Daily Notes provided!");
            return undefined;
        }

        if (!templatePath.endsWith(".md")) {
            templatePath = templatePath + ".md";
        }

        const templateFile = this.plugin.app.vault.getAbstractFileByPath(templatePath);
        console.log(templateFile);
        if (templateFile instanceof TFile) {
            return await this.plugin.app.vault.read(templateFile);
        }
        this.plugin.show("Error with template file!");
        return undefined;
    }

    /**
     * Generates the daily note path based on format and folder
     */
    getDailyNotePath(folder: string, format: string) {
        const momentDate = moment();
        const formattedDate = momentDate.format(format);

        const filePath = normalizePath(`${folder}/${formattedDate}.md`);
        const folderPath = filePath.split("/").slice(0, -1).join("/");
        console.log(folderPath);

        return { filePath, folderPath };
    }

    /**
     * Fetches daily note content from WebDAV server
     */
    async getDailyNoteRemotely(dailyNotePath: string): Promise<string | undefined> {
        if (await this.plugin.webdavClient.exists(normalizePath(this.plugin.baseWebdav + "/" + dailyNotePath))) {
            const response = await this.plugin.webdavClient.get(normalizePath(this.plugin.baseWebdav + "/" + dailyNotePath));
            if (response.status === 200 && response.data) {
                return new TextDecoder().decode(response.data);
            } else {
                console.error("Daily Note: no connection possible");
            }
        } else {
            console.log("Daily Note: File doesnt exist remotely!");
        }
        return undefined;
    }

    testSettings() {
        console.log(this.plugin.settings.dailyNotesFolder);
    }

    /**
     * Main function to create/sync daily note
     */
    async dailyNote(middleCick = false) {
        if (!this.ignoreConnection && this.plugin.status !== Status.NONE) {
            this.plugin.show("Cant use Daily Notes feature: Status must be " + Status.NONE);
            return;
        }
        try {
            // Check internet connection
            // const existBool = await this.plugin.webdavClient.exists(this.plugin.settings.webdavPath);

            // Connection check with retries
            if (!this.ignoreConnection) {
                const maxRetries = 3;
                const timeout = 500; // 500ms timeout
                let retryCount = 0;
                let connected: boolean | unknown = false;

                while (retryCount <= maxRetries && !connected) {
                    try {
                        // Try to test connection with timeout
                        connected = await Promise.race([
                            this.plugin.webdavClient.exists(this.plugin.settings.webdavPath),
                            new Promise((_, reject) => setTimeout(() => reject(new Error("Connection timeout")), timeout)),
                        ]);

                        if (connected) break;
                    } catch (error) {
                        console.log(`Connection attempt ${retryCount + 1} failed: ${error.message}`);
                    }

                    retryCount++;

                    // If not the last retry, wait before trying again
                    if (retryCount <= maxRetries && !connected) {
                        await new Promise((resolve) => setTimeout(resolve, timeout));
                    }
                }
                if (!connected) {
                    this.plugin.show("No internet connection. Click Daily Notes again to force new note without connecting to server.");
                    this.ignoreConnection = true;
                    return;
                }
            }

            this.ignoreConnection = false;

            // Consider moving these to plugin settings
            // const folder = "Daily Notes";
            // const format = "YYYY/YYYY-MM/YYYY-MM-DD ddd";
            const folder = this.plugin.settings.dailyNotesFolder;
            const format = this.plugin.settings.dailyNotesFormat;

            const { filePath, folderPath } = this.getDailyNotePath(folder, format);

            // Ensure folder exists before proceeding
            await createFolderIfNotExists(this.plugin.app.vault, folderPath);

            // let remoteContent: string | undefined = undefined;
            // if (!this.ignoreConnection) {
            // Get remote content first
            const remoteContent = await this.getDailyNoteRemotely(filePath);

            // Create or update the note
            const [dailyNote, usedTemplate] = await this.getDailyNote(filePath, remoteContent);

            // Open the note
            await this.plugin.app.workspace.getLeaf(middleCick).openFile(dailyNote);
            // Get the active editor
            const editor = this.plugin.app.workspace.activeEditor?.editor;

            if (editor && this.plugin.settings.dailyNotesTimestamp && usedTemplate !== true) {
                // Get the last line index
                // const lastLine = editor.lineCount() - 1;
                let lastLine = editor.lastLine();

                // Get the content of the last line
                const lastLineContent = editor.getLine(lastLine);

                // Append the timestamp to the existing content
                editor.setLine(lastLine, lastLineContent + `\n\n${moment().format("HH:mm")} - `);

                lastLine = editor.lastLine();

                const lastLineLength = editor.getLine(lastLine).length;

                // Set the cursor to the end of the last line
                editor.setCursor({ line: lastLine, ch: lastLineLength });
            }
        } catch (err) {
            console.error("Failed to create/open daily note:", err);
            throw new Error(`Daily note operation failed: ${err.message}`);
        }
    }
}
