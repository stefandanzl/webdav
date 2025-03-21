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
    async getDailyNote(filePath: string, remoteContent: string): Promise<TFile> {
        let finalContent = "";

        // Check if file exists locally
        const existingFile = this.plugin.app.vault.getAbstractFileByPath(filePath);
        if (existingFile instanceof TFile) {
            const localContent = await this.plugin.app.vault.read(existingFile);

            // Use remote content if it's longer, otherwise keep local
            if (remoteContent && remoteContent.length > localContent.length) {
                this.plugin.show("Modified Daily Note from the one on Webdav");
                finalContent = remoteContent;
                // Update existing file instead of creating new one
                await this.plugin.app.vault.modify(existingFile, finalContent);
                return existingFile;
            } else {
                return existingFile;
            }
        }

        // If file doesn't exist, use remote content or template
        finalContent = remoteContent || (await this.getTemplateContent());

        try {
            this.plugin.show("Created Daily Note from the one on Webdav");
            return await this.plugin.app.vault.create(filePath, finalContent);
        } catch (err) {
            this.plugin.show("Daily Note File Error: ", err);

            console.error(`Failed to create daily note at '${filePath}':`, err);
            throw new Error(`Failed to create daily note: ${err.message}`);
        }
    }

    /**
     * Gets template content if specified
     */
    private async getTemplateContent(): Promise<string> {
        const templatePath = this.plugin.settings.dailyNotesFolder;
        if (!templatePath) return "";

        const templateFile = this.plugin.app.vault.getAbstractFileByPath(templatePath);
        if (templateFile instanceof TFile) {
            return await this.plugin.app.vault.read(templateFile);
        }
        return "";
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
    async getDailyNoteRemotely(dailyNotePath: string): Promise<string> {
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
        return "";
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
            if (!this.ignoreConnection && !(await this.plugin.operations.test(false))) {
                this.plugin.show("No internet connection. Click Daily Notes again to force new note without connecting to server.");
                this.ignoreConnection = true;
                return;
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
            // Get remote content first
            const remoteContent = await this.getDailyNoteRemotely(filePath);

            // Create or update the note
            const dailyNote = await this.getDailyNote(filePath, remoteContent);

            // Open the note
            await this.plugin.app.workspace.getLeaf(middleCick).openFile(dailyNote);
            // Get the active editor
            const editor = this.plugin.app.workspace.activeEditor?.editor;

            if (editor && this.plugin.settings.dailyNotesTimestamp) {
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
