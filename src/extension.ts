import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { getFlatpakTasks, getTask } from "./tasks";

interface BuildOptions {
  "append-path"?: string;
  "build-args": string[];
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
    "**/{target,.vscode,.flatpak-builder,flatpak_app}/*",
    1000
  );

  console.log(vscode.workspace.workspaceFolders);
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

export async function activate(context: vscode.ExtensionContext) {
  console.log("The Flatpak vscode extension is now active");
  const manifestUri = await findManifest();
  if (manifestUri) {
    const buildDir = vscode.workspace.asRelativePath("flatpak_app");
    console.log(buildDir);
    console.log(manifestUri);
    vscode.window
      .showInformationMessage(
        "A Flatpak manifest was found, do you want to configure it?",
        ...["No", "Yes"]
      )
      .then((response: string | undefined) => {
        if (response === "Yes") {
          vscode.commands.executeCommand("flatpakvscode.build");
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

    const buildCommandHandler = async () => {
      vscode.window.showInformationMessage("Starting a build...");
      try {
        if (!(await fs.promises.stat(buildDir))) {
          await vscode.tasks.executeTask(await getTask("build-init"));
        }
      } catch (error) {
        console.log("Build directory already initialized, skipping...");
      }
      await vscode.tasks.executeTask(await getTask("update-deps"));
      await vscode.tasks.executeTask(await getTask("build"));
    };

    context.subscriptions.push(
      vscode.commands.registerCommand(
        "flatpakvscode.build",
        buildCommandHandler
      )
    );

    const runCommandHandler = () => {
      vscode.window.showInformationMessage("Rebuild the application...");
      getTask("rebuild").then((task) => vscode.tasks.executeTask(task))
        .then(() => getTask("run")).then((task) => vscode.tasks.executeTask(task))
        .catch((erro) => console.error(erro))
    };

    context.subscriptions.push(
      vscode.commands.registerCommand("flatpakvscode.run", runCommandHandler)
    );
  }
}

export function deactivate() {}
