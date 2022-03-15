with import <nixpkgs> {};
pkgs.mkShell {
  buildInputs = [
    yarn
    nodePackages.typescript
    nodePackages.typescript-language-server # typescript/javascript language server
  ];
}
