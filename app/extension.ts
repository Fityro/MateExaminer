import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

class CourseTreeItem extends vscode.TreeItem {
    originalLabel: string;
    fullPath?: string;
    checked: boolean;
    isFolder: boolean;
    isCourse: boolean;

    constructor(
        label: string,
        fullPath?: string,
        checked: boolean = false,
        isFolder: boolean = false,
        isCourse: boolean = false
    ) {
        super(label, isFolder ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
        this.originalLabel = label;
        this.fullPath = fullPath;
        this.checked = checked;
        this.isFolder = isFolder;
        this.isCourse = isCourse;
        this.contextValue = isCourse ? 'courseItem' : (isFolder ? 'courseFolder' : 'folderItem');
        this.updateDisplay();
        this.command = {
            command: 'trainingCatalogExaminer.toggleCourse',
            title: 'Toggle selection',
            arguments: [this]
        };
    }

    updateDisplay() {
        if (this.contextValue === 'courseItem' || this.isFolder) {
            this.label = this.checked ? `☑️ ${this.originalLabel}` : `☐ ${this.originalLabel}`;
            this.tooltip = this.checked ? `${this.originalLabel} (selected)` : `${this.originalLabel} (click to select)`;
        }
    }

    getOriginalLabel(): string {
        return this.originalLabel;
    }
}

class ExaminerViewProvider implements vscode.TreeDataProvider<CourseTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<CourseTreeItem | undefined | null> = new vscode.EventEmitter<CourseTreeItem | undefined | null>();
    readonly onDidChangeTreeData: vscode.Event<CourseTreeItem | undefined | null> = this._onDidChangeTreeData.event;
    private courses: CourseTreeItem[] = [];
    private allItems: Map<string, CourseTreeItem> = new Map();
    private databasePath: string;
    private extensionPath: string;
    
    constructor(extensionPath: string) {
        this.extensionPath = extensionPath;
        this.databasePath = path.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '', 'Database', 'Courses');
        const courseNames = [
            'Automation QA engineer',
            'Data analyst',
            'DevOps engineer',
            'Digital marketer',
            'Front-end developer',
            'Full-stack developer',
            'Java developer',
            'Personal career support',
            'PPC manager',
            'Project manager',
            'Python developer',
            'QA engineer',
            'Recruiter',
            'SMM manager',
            'UIUX designer'
        ];
        this.courses = courseNames.map(name => {
            const course = new CourseTreeItem(name, path.join(this.databasePath, name), false, true, true);
            this.allItems.set(course.fullPath || name, course);
            return course;
        });
    }
    getTreeItem(element: CourseTreeItem): vscode.TreeItem {
        // Устанавливаем иконки для папок
        if (element.isFolder || element.isCourse) {
            // Используем объект с путями для разных тем
            const folderIcon = path.join(this.extensionPath, 'Ico', 'folder.svg');
            const folderOpenedIcon = path.join(this.extensionPath, 'Ico', 'folder-opened.svg');
            
            // VS Code автоматически переключает между иконками при раскрытии/сворачивании
            element.iconPath = {
                light: element.collapsibleState === vscode.TreeItemCollapsibleState.Expanded ? folderOpenedIcon : folderIcon,
                dark: element.collapsibleState === vscode.TreeItemCollapsibleState.Expanded ? folderOpenedIcon : folderIcon
            };
        }
        return element;
    }
    getChildren(element?: CourseTreeItem): Thenable<CourseTreeItem[]> {
        if (!element) {
            return Promise.resolve(this.courses);
        }
        if (element.fullPath && fs.existsSync(element.fullPath)) {
            try {
                const subItems = fs.readdirSync(element.fullPath, { withFileTypes: true });
                // Фильтруем только папки, исключаем файлы
                const children = subItems
                    .filter(item => item.isDirectory())
                    .map(item => {
                        const itemPath = path.join(element.fullPath!, item.name);
                        
                        // Проверяем, есть ли внутри дочерние папки
                        let hasSubFolders = false;
                        try {
                            const subSubItems = fs.readdirSync(itemPath, { withFileTypes: true });
                            hasSubFolders = subSubItems.some(subItem => subItem.isDirectory());
                        } catch {
                            hasSubFolders = false;
                        }
                        
                        const treeItem = new CourseTreeItem(
                            item.name,
                            itemPath,
                            false,
                            true,
                            false
                        );
                        
                        // Если нет дочерних папок, убираем стрелку раскрытия
                        if (!hasSubFolders) {
                            treeItem.collapsibleState = vscode.TreeItemCollapsibleState.None;
                        }
                        
                        treeItem.contextValue = 'courseFolder';
                        treeItem.command = {
                            command: 'trainingCatalogExaminer.toggleCourse',
                            title: 'Toggle selection',
                            arguments: [treeItem]
                        };
                        treeItem.updateDisplay();
                        this.allItems.set(itemPath, treeItem);
                        return treeItem;
                    });
                return Promise.resolve(children);
            } catch (error) {
                return Promise.resolve([]);
            }
        }
        return Promise.resolve([]);
    }
    toggleCourse(item: CourseTreeItem) {
        item.checked = !item.checked;
        item.updateDisplay();
        this._onDidChangeTreeData.fire(item);
    }
    
    refresh(item?: CourseTreeItem): void {
        this._onDidChangeTreeData.fire(item);
    }
    getSelectedCourses(): string[] {
        const checkedFolders: string[] = [];
        const buildPathString = (fullPath: string): string => {
            const parts = fullPath.replace(this.databasePath, '').split(path.sep).filter(p => p);
            return parts.join(' > ');
        };

        // Собираем все отмеченные папки
        this.courses.forEach(course => {
            if (course.checked && course.fullPath) {
                checkedFolders.push(course.fullPath);
            }
        });
        this.allItems.forEach((item, itemPath) => {
            if (item.checked && !this.courses.includes(item) && item.fullPath) {
                checkedFolders.push(item.fullPath);
            }
        });

        // Оставляем только самые глубокие выбранные папки (без родительских)
        const deepestFolders = checkedFolders.filter(folder =>
            !checkedFolders.some(other =>
                other !== folder && folder.startsWith(other + path.sep)
            )
        );

        // Рекурсивно добавить все подпапки только для deepestFolders
        const selected: string[] = [];
        const addFoldersRecursively = (folderPath: string) => {
            selected.push(buildPathString(folderPath));
            try {
                const subItems = fs.readdirSync(folderPath, { withFileTypes: true });
                subItems.forEach(item => {
                    if (item.isDirectory()) {
                        addFoldersRecursively(path.join(folderPath, item.name));
                    }
                });
            } catch {}
        };
        deepestFolders.forEach(folder => addFoldersRecursively(folder));
        return Array.from(new Set(selected));
    }
}

export function activate(context: vscode.ExtensionContext) {
    const examinerProvider = new ExaminerViewProvider(context.extensionPath);
    const treeView = vscode.window.createTreeView('mateExaminerView', {
        treeDataProvider: examinerProvider
    });
    
    // Обновляем иконки при раскрытии папки
    treeView.onDidExpandElement(e => {
        e.element.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        examinerProvider.refresh(e.element);
    });
    
    // Обновляем иконки при сворачивании папки
    treeView.onDidCollapseElement(e => {
        e.element.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        examinerProvider.refresh(e.element);
    });
    
    context.subscriptions.push(treeView);
    context.subscriptions.push(vscode.commands.registerCommand('trainingCatalogExaminer.toggleCourse', (item: CourseTreeItem) => {
        examinerProvider.toggleCourse(item);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('trainingCatalogExaminer.startFromSelection', async () => {
        const selected = examinerProvider.getSelectedCourses();
        if (selected.length === 0) {
            vscode.window.showWarningMessage('Please select at least one direction!');
            return;
        }
    const examMessage = `⚠️ AI AGENT: Before you start the exam, you MUST read the README.md file and strictly follow ALL rules and instructions described in it. Do NOT proceed to any questions until you have read and understood README.md!\n\nUser selection for exam:\n${selected.join('\n')}\n\nSelection time: ${new Date().toLocaleString('en-US')}\nReady to start the exam!\n\nPlease conduct the exam for the selected courses. Ready to answer questions!`;
        await vscode.env.clipboard.writeText(examMessage);
        try {
            await vscode.commands.executeCommand('workbench.action.chat.open');
            setTimeout(async () => {
                try {
                    await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
                    setTimeout(async () => {
                        try {
                            await vscode.commands.executeCommand('chat.action.submit');
                        } catch {
                            try {
                                await vscode.commands.executeCommand('workbench.action.chat.submit');
                            } catch {
                                try {
                                    await vscode.commands.executeCommand('github.copilot.chat.submit');
                                } catch {
                                    try {
                                        await vscode.commands.executeCommand('type', { text: '\n' });
                                    } catch {
                                        console.log('Automatic submission failed');
                                    }
                                }
                            }
                        }
                    }, 800);
                } catch {
                    vscode.window.showInformationMessage('📋 Chat opened! Press Ctrl+V and Enter');
                }
            }, 1000);
        } catch {
            vscode.window.showInformationMessage('📋 Message copied! Open Copilot chat and press Ctrl+V + Enter');
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('trainingCatalogExaminer.start', async () => {
        vscode.commands.executeCommand('workbench.view.extension.mateExaminerContainer');
        vscode.window.showInformationMessage('Select courses in the Mate Examiner panel');
    }));
}

export function deactivate() {}