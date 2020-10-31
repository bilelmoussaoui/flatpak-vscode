import { readFileSync } from "fs";
import * as vscode from "vscode";
import { FlatpakManifest } from "./extension";

interface FlatpakTaskDefinition extends vscode.TaskDefinition {
  type: "flatpak";
  mode?: "build-init" | "build" | "run" | "export" | "update-deps" | "rebuild";
  manifest: vscode.Uri;
}

export const getFlatpakTasks = async (
  manifest: FlatpakManifest,
  uri: vscode.Uri
): Promise<vscode.Task[]> => {
  const appId = manifest.id || manifest["app-id"];
  const branch = manifest.branch || "master";
  const moduleName = manifest.modules.slice(-1)[0].name;
  const buildDir = "flatpak_app";
  const uid = 1000;

  const buildInit = new vscode.Task(
    {
      type: "flatpak",
      mode: "build-init",
    },
    vscode.TaskScope.Workspace,
    "Prepare the Flatpak build directory",
    "Build Init",
    new vscode.ShellExecution(
      `flatpak build-init ${buildDir} ${appId} ${manifest.sdk} ${manifest.runtime} ${branch}`
    )
  );
  buildInit.isBackground = false;

  const updateDependencies = new vscode.Task(
    {
      type: "flatpak",
      mode: "update-deps",
    },
    vscode.TaskScope.Workspace,
    "Update the dependencies the Flatpak build directory",
    "Update dependencies",
    new vscode.ShellExecution(
      `flatpak-builder --ccache --force-clean --disable-updates --download-only --stop-at=${moduleName} ${buildDir} ${uri.fsPath}`
    )
  );
  updateDependencies.isBackground = false;

  const build = new vscode.Task(
    {
      type: "flatpak",
      mode: "build",
    },
    vscode.TaskScope.Workspace,
    "Build the dependencies of the Flatpak",
    "Build",
    new vscode.ShellExecution(
      `flatpak-builder --ccache --force-clean --disable-updates --disable-download --stop-at=${moduleName} ${buildDir} ${uri.fsPath}`
    )
  );
  build.group = vscode.TaskGroup.Build;
  build.isBackground = false;

  const rebuild = new vscode.Task(
    {
      type: "flatpak",
      mode: "rebuild",
    },
    vscode.TaskScope.Workspace,
    "Rebuild the application",
    "Rebuild",
    new vscode.ShellExecution(
      `flatpak-builder --ccache --force-clean --disable-updates --disable-download --build-only ${buildDir} ${uri.fsPath}`
    )
  );
  rebuild.group = vscode.TaskGroup.Build;
  rebuild.isBackground = false;

  /* build finish
  `flatpak build-finish --command=${manifest.command} ${manifest[
        "finish-args"
      ].join(" ")} ${buildDir}`
  */
  const buildFinish = new vscode.Task(
    {
      type: "flatpak",
      mode: "run",
    },
    vscode.TaskScope.Workspace,
    "Build the application and run it",
    "Run",
    new vscode.ShellExecution(
      `flatpak build-finish --command=${manifest.command} ${manifest[
        "finish-args"
      ].join(" ")} ${buildDir}`
    )
  );

  const run = new vscode.Task(
    {
      type: "flatpak",
      mode: "run",
    },
    vscode.TaskScope.Workspace,
    "Build the application and run it",
    "Run",
    new vscode.ShellExecution(
      `flatpak build --with-appdir --allow=devel --bind-mount=/run/user/${uid}/doc=/run/user/${uid}/doc/by-app/${appId} ${manifest[
        "finish-args"
      ].join(" ")} --talk-name='org.freedesktop.portal.*' ${buildDir} ${
        manifest.command
      }`
    )
  );
  run.isBackground = false;

  const exportBundle = new vscode.Task(
    {
      type: "flatpak",
      mode: "export",
    },
    vscode.TaskScope.Workspace,
    "Build the application and export it as a bundle",
    "Export bundle",
    new vscode.ShellExecution('print "hey"')
  );

  return [buildInit, build, rebuild, run, exportBundle, updateDependencies];
};

export async function getTask(mode: string) {
  const tasks = await vscode.tasks.fetchTasks({ type: "flatpak" });
  const filtered = tasks.filter((t) => t.definition.mode === mode);
  if (filtered.length === 0) throw new Error(`Cannot find ${mode} task`);
  return filtered[0];
}
