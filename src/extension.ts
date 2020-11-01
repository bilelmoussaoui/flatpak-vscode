import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { getFlatpakTasks, getTask } from "./tasks";

const EXT_ID = "flatpakvscode";

interface BuildOptions {
  "append-path"?: string;
  "build-args": string[];
  env: Object;
}

interface Source {
  type: string;
  url?: string;
  path?: string;
  tag?: string;
  commit?: string;
  sha256?: string;
}

interface Module {
  name: string;
  buildsystem: string;
  "config-opts": string[];
  sources: Source[];
}

export interface FlatpakManifest {
  id?: string;
  branch?: string;
  "app-id"?: string;
  modules: Module[];
  sdk: string;
  runtime: string;
  "runtime-version": string;
  "sdk-extensions"?: string[];
  command: string;
  "finish-args": string[];
  "build-options"?: BuildOptions;
}

const isFlatpak = (manifest: FlatpakManifest): boolean => {
  const hasId = (manifest.id || manifest["app-id"]) !== undefined;
  const hasModules = manifest["modules"] !== undefined;
  return hasId && hasModules;
};

const parseManifest = async (
  uri: vscode.Uri
): Promise<FlatpakManifest | null> => {
  const data = (await fs.promises.readFile(uri.fsPath)).toString();
  let manifest = null;

  switch (path.extname(uri.fsPath)) {
    case ".json":
      manifest = JSON.parse(data);
      break;
    case ".yml":
    case ".yaml":
      manifest = yaml.safeLoad(data);
      break;
    default:
      console.error(
        "Failed to parse the manifest, please use a valid extension."
      );
      break;
  }

  if (isFlatpak(manifest)) {
    return manifest;
  }
  return null;
};

const findManifest = async (): Promise<vscode.Uri | null> => {
  console.log("Trying to find a Flatpak manifest...");
  const uris: vscode.Uri[] = await vscode.workspace.findFiles(
    "**/*.{json,yaml,yml}",
    "**/{target,.vscode,.flatpak-builder,flatpak_app,.flatpak}/*",
    1000
  );

  for (let uri of uris) {
    try {
      const manifest = await parseManifest(uri);
      if (manifest) {
        return uri;
      }
    } catch (err) {
      console.warn(`Failed to parse the JSON file at ${uri.fsPath}`);
    }
  }
  return null;
};

const execTask = async (mode: string, message: string | null) => {
  if (message) vscode.window.showInformationMessage(message);
  const task = await getTask(mode);
  await vscode.tasks.executeTask(task);
};

export async function activate(context: vscode.ExtensionContext) {
  console.log("The Flatpak vscode extension is now active");
  const manifestUri = await findManifest();

  if (manifestUri) {
    vscode.window
      .showInformationMessage(
        "A Flatpak manifest was found, do you want to configure it?",
        ...["No", "Yes"]
      )
      .then((response: string | undefined) => {
        if (response === "Yes") {
          vscode.commands.executeCommand(`${EXT_ID}.build-init`);
        }
      });

    vscode.tasks.onDidEndTask(async (e) => {
      switch (e.execution.task.definition.mode) {
        case "build-init":
          vscode.commands.executeCommand(`${EXT_ID}.update-deps`);
          break;
        case "update-deps":
          vscode.commands.executeCommand(`${EXT_ID}.build-deps`);
          break;
        case "rebuild":
          vscode.commands.executeCommand(`${EXT_ID}.run`);
          break;
      }
    });

    context.subscriptions.push(
      vscode.tasks.registerTaskProvider("flatpak", {
        async provideTasks(token) {
          const manifest = await parseManifest(manifestUri);
          if (manifest) return getFlatpakTasks(manifest, manifestUri);
          return null;
        },
        resolveTask(task, token): vscode.ProviderResult<vscode.Task> {
          return undefined;
        },
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand(
        `${EXT_ID}.build-init`,
        async () => await execTask("build-init", "Configuring the build...")
      )
    );

    context.subscriptions.push(
      vscode.commands.registerCommand(
        `${EXT_ID}.update-deps`,
        async () =>
          await execTask("update-deps", "Updating the dependencies...")
      )
    );
    context.subscriptions.push(
      vscode.commands.registerCommand(
        `${EXT_ID}.build-deps`,
        async () => await execTask("build-deps", "Building the dependencies...")
      )
    );
    context.subscriptions.push(
      vscode.commands.registerCommand(
        `${EXT_ID}.build-app`,
        async () => await execTask("build-app", "Building the application...")
      )
    );
    context.subscriptions.push(
      vscode.commands.registerCommand(
        `${EXT_ID}.rebuild`,
        async () => await execTask("rebuild", "Rebuilding the application...")
      )
    );
    context.subscriptions.push(
      vscode.commands.registerCommand(`${EXT_ID}.clean`, async () => {
        const workspace = vscode.workspace.getWorkspaceFolder(manifestUri)?.uri
          .fsPath;
        if (workspace) {
          await fs.promises.rmdir(path.join(workspace, ".flatpak"), {
            recursive: true,
          });
          vscode.commands.executeCommand(`${EXT_ID}.build-init`);
        }
      })
    );
    context.subscriptions.push(
      vscode.commands.registerCommand(
        `${EXT_ID}.run`,
        async () => await execTask("run", "Running the application...")
      )
    );
  }
}

export function deactivate() {}
