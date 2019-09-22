import * as tsserver from 'typescript/lib/tsserverlibrary';
import { missingIdentifierCode, packageName } from './utils/constants';
import { getAssignmentsMetadata } from './utils/getAssignmentsMetadata';
import { getMissingIdentifiers } from './utils/getMissingIdentifiers';
import { getSourceFile } from './utils/getSourceFile';

const init = (modules: { typescript: typeof tsserver }) => {
  const ts = modules.typescript;

  const create = (info: tsserver.server.PluginCreateInfo) => {
    const proxy = { ...info.languageService };

    proxy.getCompletionsAtPosition = (
      fileName: string,
      position: number,
      options: tsserver.GetCompletionsAtPositionOptions | undefined
    ): tsserver.WithMetadata<tsserver.CompletionInfo> | undefined => {
      let original = info.languageService.getCompletionsAtPosition(
        fileName,
        position,
        options
      );

      const working = original
        ? original
        : {
            isGlobalCompletion: false,
            isMemberCompletion: false,
            isNewIdentifierLocation: false,
            entries: [],
          };

      working.entries = [...working.entries];

      const sourceFile = getSourceFile(info, fileName);
      const assignmentsMetadata = getAssignmentsMetadata(sourceFile);

      assignmentsMetadata.forEach(item => {
        if (item.bindingTo >= position && position >= item.bindingFrom) {
          const unusedIdentifiers = item.availableIdentifiers.filter(
            availableIdentifier => {
              return (
                item.requestedIdentifiers.filter(requestedIdentifier => {
                  return requestedIdentifier.name === availableIdentifier.name;
                }).length < 1
              );
            }
          );

          unusedIdentifiers.forEach(unusedIdentifier => {
            working.entries.push({
              name: unusedIdentifier.name,
              kind: ts.ScriptElementKind.memberVariableElement,
              sortText: unusedIdentifier.name,
              insertText: unusedIdentifier.name,
              isRecommended: true,
            });
          });
        }
      });

      return working;
    };

    proxy.getSemanticDiagnostics = (fileName: string) => {
      const original =
        info.languageService.getSemanticDiagnostics(fileName) || [];
      const result = [...original];

      const sourceFile = getSourceFile(info, fileName);

      const assignmentsMetadata = getAssignmentsMetadata(sourceFile);

      assignmentsMetadata.forEach(assignmentMetadata => {
        const missingIdentifiers = getMissingIdentifiers(assignmentMetadata);

        missingIdentifiers.forEach(missingIdentifier => {
          result.push({
            source: packageName,
            category: ts.DiagnosticCategory.Error,
            code: missingIdentifierCode,
            file: sourceFile,
            start: missingIdentifier.from,
            length: missingIdentifier.to - missingIdentifier.from,
            messageText: `Identifier "${missingIdentifier.name}" is missing in corresponding CSS.`,
          });
        });
      });

      return result;
    };

    return proxy;
  };

  return { create };
};

export = init;
