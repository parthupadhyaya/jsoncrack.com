import React from "react";
import type { ModalProps } from "@mantine/core";
import { Modal, Stack, Text, ScrollArea, Flex, CloseButton, Textarea, Button } from "@mantine/core";
import { CodeHighlight } from "@mantine/code-highlight";
import type { NodeData } from "../../../types/graph";
import useGraph from "../../editor/views/GraphView/stores/useGraph";
import useJson from "../../../store/useJson";
import useFile from "../../../store/useFile";

// return object from json removing array and object fields
const normalizeNodeData = (nodeRows: NodeData["text"]) => {
  if (!nodeRows || nodeRows.length === 0) return "{}";
  if (nodeRows.length === 1 && !nodeRows[0].key) return `${nodeRows[0].value}`;

  const obj = {};
  nodeRows?.forEach(row => {
    if (row.type !== "array" && row.type !== "object") {
      if (row.key) obj[row.key] = row.value;
    }
  });
  return JSON.stringify(obj, null, 2);
};

// return json path in the format $["customer"]
const jsonPathToString = (path?: NodeData["path"]) => {
  if (!path || path.length === 0) return "$";
  const segments = path.map(seg => (typeof seg === "number" ? seg : `"${seg}"`));
  return `$[${segments.join("][")}]`;
};

export const NodeModal = ({ opened, onClose }: ModalProps) => {
  const nodeData = useGraph(state => state.selectedNode);
  const getJson = useJson(state => state.getJson);
  const setContents = useFile(state => state.setContents);
  const setLoading = useGraph(state => state.setLoading);

  const [isEditing, setIsEditing] = React.useState(false);
  const [editValue, setEditValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [savedValue, setSavedValue] = React.useState<string | null>(null);
  // When editing keyed properties we keep a map of key -> string value
  const [editFields, setEditFields] = React.useState<Record<string, string> | null>(null);

  React.useEffect(() => {
    if (!isEditing) {
      setError(null);
    }
  }, [isEditing, opened]);

  return (
    <Modal size="auto" opened={opened} onClose={onClose} centered withCloseButton={false}>
      <Stack pb="sm" gap="sm">
        <Stack gap="xs">
          <Flex justify="space-between" align="center">
            <Text fz="xs" fw={500}>
              Content
            </Text>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ display: "flex", gap: 8 }}>
                {!isEditing ? (
                  <Button size="xs" variant="subtle" onClick={() => {
                    // Prepare editing state: either per-key fields or a single text area
                    const rows = nodeData?.text ?? [];
                    const simpleRows = rows.filter(r => r.type !== "array" && r.type !== "object");
                    if (simpleRows.length > 1 || (simpleRows.length === 1 && simpleRows[0].key)) {
                      const map: Record<string, string> = {};
                      simpleRows.forEach(r => {
                        if (r.key) map[r.key] = String(r.value ?? "");
                      });
                      setEditFields(map);
                      setEditValue("");
                    } else {
                      // single value (with or without key) -> keep previous behaviour
                      setEditFields(null);
                      setEditValue(savedValue || normalizeNodeData(nodeData?.text ?? []));
                    }

                    setIsEditing(true);
                  }}>
                    Edit
                  </Button>
                ) : (
                  <>
                    <Button size="xs" onClick={() => {
                      // Save handler: either serialize editFields or parse editValue
                      try {
                        let parsed: any;
                        if (editFields) {
                          parsed = {} as Record<string, any>;
                          for (const k of Object.keys(editFields)) {
                            const valStr = editFields[k];
                            try {
                              parsed[k] = JSON.parse(valStr);
                            } catch (_e) {
                              // keep as string if not valid JSON
                              parsed[k] = valStr;
                            }
                          }
                        } else {
                          parsed = JSON.parse(editValue);
                        }

                        const raw = getJson();
                        const obj = raw ? JSON.parse(raw) : {};

                        const path = nodeData?.path;
                        if (!path || path.length === 0) {
                          // replace root
                          setContents({ contents: JSON.stringify(parsed, null, 2), hasChanges: true });
                        } else {
                          let target: any = obj;
                          for (let i = 0; i < path.length - 1; i++) {
                            const seg = path[i] as string | number;
                            if (typeof seg === "number") {
                              if (!Array.isArray(target)) throw new Error("Path mismatch: expected array");
                              target = target[seg];
                            } else {
                              if (target[seg] === undefined) throw new Error("Path not found");
                              target = target[seg];
                            }
                          }

                          const last = path[path.length - 1] as string | number;
                          if (typeof last === "number") {
                            if (!Array.isArray(target)) throw new Error("Path mismatch: expected array for last segment");
                            target[last] = parsed;
                          } else {
                            target[last] = parsed;
                          }

                          setContents({ contents: JSON.stringify(obj, null, 2), hasChanges: true });
                        }

                        // Store the last saved representation for display
                        setSavedValue(JSON.stringify(parsed, null, 2));
                        setLoading(true); // Trigger graph refresh
                        setTimeout(() => {
                          setLoading(false);
                          setIsEditing(false);
                          setEditFields(null);
                          setEditValue("");
                          setError(null);
                        }, 100);
                      } catch (e: any) {
                        setError(e?.message || "Invalid JSON");
                      }
                    }}>Save</Button>
                    <Button size="xs" variant="subtle"  onClick={() => { setIsEditing(false); setError(null); setEditFields(null); setEditValue(""); }}>Cancel</Button>
                  </>
                )}
              </div>
              <CloseButton onClick={onClose} />
            </div>
          </Flex>
          <ScrollArea.Autosize mah={250} maw={600}>
            {!isEditing ? (
              <CodeHighlight
                code={savedValue || normalizeNodeData(nodeData?.text ?? [])}
                miw={350}
                maw={600}
                language="json"
                withCopyButton
              />
            ) : (
              <div>
                {/* If editFields is populated render a labeled textarea per key */}
                {editFields ? (
                  <Stack gap="xs">
                    {Object.keys(editFields).map(k => (
                      <div key={k}>
                        <Text fz="xs" color="dimmed">{k}</Text>
                        <Textarea
                          minRows={2}
                          value={editFields[k]}
                          onChange={(e) => setEditFields({ ...editFields, [k]: e.currentTarget.value })}
                          styles={{ input: { fontFamily: "monospace" } }}
                        />
                      </div>
                    ))}
                  </Stack>
                ) : (
                  <div>
                    <Textarea
                      minRows={6}
                      value={editValue}
                      onChange={(e) => setEditValue(e.currentTarget.value)}
                      styles={{ input: { fontFamily: "monospace" } }}
                    />
                  </div>
                )}

                {error && (
                  <Text fz="xs" color="red" mt="xs">
                    {error}
                  </Text>
                )}
              </div>
            )}
          </ScrollArea.Autosize>
        </Stack>
        <Text fz="xs" fw={500}>
          JSON Path
        </Text>
        <ScrollArea.Autosize maw={600}>
          <CodeHighlight
            code={jsonPathToString(nodeData?.path)}
            miw={350}
            mah={250}
            language="json"
            copyLabel="Copy to clipboard"
            copiedLabel="Copied to clipboard"
            withCopyButton
          />
        </ScrollArea.Autosize>
      </Stack>
    </Modal>
  );
};
