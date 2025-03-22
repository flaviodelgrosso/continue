import {
  ArrowRightIcon,
  AtSymbolIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { Editor } from "@tiptap/react";
import {
  forwardRef,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useDispatch } from "react-redux";
import styled from "styled-components";
import {
  defaultBorderRadius,
  lightGray,
  vscForeground,
  vscListActiveBackground,
  vscListActiveForeground,
  vscQuickInputBackground,
} from "..";
import { IdeMessengerContext } from "../../context/IdeMessenger";
import { setDialogMessage, setShowDialog } from "../../redux/slices/uiSlice";
import FileIcon from "../FileIcon";
import SafeImg from "../SafeImg";
import AddDocsDialog from "../dialogs/AddDocsDialog";
import HeaderButtonWithToolTip from "../gui/HeaderButtonWithToolTip";
import { NAMED_ICONS } from "./icons";
import { ComboBoxItem, ComboBoxItemType } from "./types";

export function getIconFromDropdownItem(
  id: string | undefined,
  type: ComboBoxItemType,
) {
  const typeIcon =
    type === "contextProvider" ? AtSymbolIcon : ChatBubbleLeftIcon;
  return id ? (NAMED_ICONS[id] ?? typeIcon) : typeIcon;
}

function DropdownIcon(props: { className?: string; item: ComboBoxItem }) {
  if (props.item.type === "action") {
    return (
      <PlusIcon className={props.className} height="1.2em" width="1.2em" />
    );
  }

  const provider =
    props.item.type === "contextProvider" || props.item.type === "slashCommand"
      ? props.item.id
      : props.item.type;

  const IconComponent = getIconFromDropdownItem(provider, props.item.type);

  const fallbackIcon = (
    <IconComponent
      className={`${props.className} flex-shrink-0`}
      height="1.2em"
      width="1.2em"
    />
  );

  if (!props.item.icon) {
    return fallbackIcon;
  }

  return (
    <SafeImg
      className="flex-shrink-0 pr-2"
      src={props.item.icon}
      height="18em"
      width="18em"
      fallback={fallbackIcon}
    />
  );
}

const ItemsDiv = styled.div`
  border-radius: ${defaultBorderRadius};
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.05),
    0px 10px 20px rgba(0, 0, 0, 0.1);
  font-size: 0.9rem;
  overflow-x: hidden;
  overflow-y: auto;
  max-height: 330px;
  padding: 0.2rem;
  position: relative; // absolute to test tippy.js bug

  background-color: ${vscQuickInputBackground};
  /* backdrop-filter: blur(12px); */
`;

const ItemDiv = styled.div`
  background: transparent;
  border: 1px solid transparent;
  border-radius: 0.4rem;
  display: block;
  margin: 0;
  padding: 0.2rem 0.4rem;
  text-align: left;
  width: 100%;
  color: ${vscForeground};

  &.is-selected {
    background-color: ${vscListActiveBackground};
    color: ${vscListActiveForeground};
  }
`;

const QueryInput = styled.textarea`
  background-color: #fff1;
  border: 1px solid ${lightGray};
  border-radius: ${defaultBorderRadius};

  padding: 0.2rem 0.4rem;
  width: 240px;

  color: ${vscForeground};

  &:focus {
    outline: none;
  }

  font-family: inherit;
  resize: none;
`;

interface MentionListProps {
  items: ComboBoxItem[];
  command: (item: any) => void;

  editor: Editor;
  enterSubmenu?: (editor: Editor, providerId: string) => void;
  onClose: () => void;
}

const MentionList = forwardRef((props: MentionListProps, ref) => {
  const dispatch = useDispatch();

  const ideMessenger = useContext(IdeMessengerContext);

  const [selectedIndex, setSelectedIndex] = useState(0);

  const [subMenuTitle, setSubMenuTitle] = useState<string | undefined>(
    undefined,
  );
  const [querySubmenuItem, setQuerySubmenuItem] = useState<
    ComboBoxItem | undefined
  >(undefined);
  const [loadingSubmenuItem, setLoadingSubmenuItem] = useState<
    ComboBoxItem | undefined
  >(undefined);

  const [allItems, setAllItems] = useState<ComboBoxItem[]>([]);

  useEffect(() => {
    const items = [...props.items];
    if (subMenuTitle === "Type to search docs") {
      items.push({
        title: "Add Docs",
        type: "action",
        action: () => {
          dispatch(setShowDialog(true));
          dispatch(setDialogMessage(<AddDocsDialog />));

          // Delete back to last '@'
          const { tr } = props.editor.view.state;
          const text = tr.doc.textBetween(0, tr.selection.from);
          const start = text.lastIndexOf("@");
          props.editor.view.dispatch(
            tr.delete(start, tr.selection.from).scrollIntoView(),
          );
        },
        description: "Add a new documentation source",
      });
    } else if (subMenuTitle === ".prompt files") {
      items.push({
        title: "New .prompt file",
        type: "action",
        action: () => {
          ideMessenger.post("config/newPromptFile", undefined);
          const { tr } = props.editor.view.state;
          const text = tr.doc.textBetween(0, tr.selection.from);
          const start = text.lastIndexOf("@");
          if (start !== -1) {
            props.editor.view.dispatch(
              tr.delete(start, tr.selection.from).scrollIntoView(),
            );
          }
          props.onClose(); // Escape the mention list after creating a new prompt file
        },
        description: "Create a new .prompt file",
      });
    }
    setLoadingSubmenuItem(items.find((item) => item.id === "loading"));
    setAllItems(items.filter((item) => item.id !== "loading"));
  }, [subMenuTitle, props.items, props.editor]);

  const queryInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (queryInputRef.current) {
      queryInputRef.current.focus();
    }
  }, [querySubmenuItem, queryInputRef]);

  const selectItem = (index: number) => {
    const item = allItems[index];

    if (item.type === "action" && item.action) {
      item.action();
      return;
    }

    if (
      item.type === "contextProvider" &&
      item.contextProvider?.type === "submenu"
    ) {
      setSubMenuTitle(item.description);
      if (item.id) {
        props.enterSubmenu?.(props.editor, item.id);
      }
      return;
    }

    if (item.contextProvider?.type === "query") {
      // update editor to complete context provider title
      const { tr } = props.editor.view.state;
      const text = tr.doc.textBetween(0, tr.selection.from);
      const partialText = text.slice(text.lastIndexOf("@") + 1);
      const remainingText = item.title.slice(partialText.length);
      props.editor.view.dispatch(
        tr.insertText(remainingText, tr.selection.from),
      );

      setSubMenuTitle(item.description);
      setQuerySubmenuItem(item);
      return;
    }

    if (item) {
      props.command({ ...item, itemType: item.type });
    }
  };

  const totalItems = allItems.length;

  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const upHandler = () => {
    setSelectedIndex((prevIndex) => {
      const newIndex = prevIndex - 1 >= 0 ? prevIndex - 1 : 0;
      itemRefs.current[newIndex]?.scrollIntoView({
        behavior: "instant" as ScrollBehavior,
        block: "nearest",
      });
      return newIndex;
    });
  };

  const downHandler = () => {
    setSelectedIndex((prevIndex) => {
      const newIndex = prevIndex + 1 < totalItems ? prevIndex + 1 : prevIndex;
      itemRefs.current[newIndex]?.scrollIntoView({
        behavior: "instant" as ScrollBehavior,
        block: "nearest",
      });
      return newIndex;
    });
  };

  const enterHandler = () => {
    selectItem(selectedIndex);
  };

  useEffect(() => setSelectedIndex(0), [allItems]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === "ArrowUp") {
        upHandler();
        return true;
      }

      if (event.key === "ArrowDown") {
        downHandler();
        return true;
      }

      if (event.key === "Enter" || event.key === "Tab") {
        enterHandler();
        event.stopPropagation();
        event.preventDefault();
        return true;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        return true;
      }

      if (event.key === " ") {
        if (allItems.length === 1) {
          enterHandler();
          return true;
        }
      }

      return false;
    },
  }));

  const showFileIconForItem = (item: ComboBoxItem) => {
    return ["file", "code"].includes(item.type);
  };

  useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, allItems.length);
  }, [allItems]);

  return (
    <ItemsDiv>
      {querySubmenuItem ? (
        <QueryInput
          onClick={(e) => {
            e.stopPropagation();
          }}
          rows={1}
          ref={queryInputRef}
          placeholder={querySubmenuItem.description}
          onKeyDown={(e) => {
            if (!queryInputRef.current) {
              return;
            }
            if (e.key === "Enter") {
              if (e.shiftKey) {
                queryInputRef.current.innerText += "\n";
              } else {
                props.command({
                  ...querySubmenuItem,
                  itemType: querySubmenuItem.type,
                  query: queryInputRef.current.value,
                  label: `${querySubmenuItem.label}: ${queryInputRef.current.value}`,
                });
              }
            } else if (e.key === "Escape") {
              setQuerySubmenuItem(undefined);
              setSubMenuTitle(undefined);
            }
          }}
        />
      ) : (
        <>
          {subMenuTitle && <ItemDiv className="mb-2">{subMenuTitle}</ItemDiv>}
          {loadingSubmenuItem && (
            <ItemDiv>
              <span className="flex w-full items-center justify-between">
                <div className="flex items-center justify-center">
                  <DropdownIcon item={loadingSubmenuItem} className="mr-2" />
                  <span>{loadingSubmenuItem.title}</span>
                  {"  "}
                </div>
                <span
                  style={{
                    color: lightGray,
                    float: "right",
                    textAlign: "right",
                    minWidth: "30px",
                  }}
                  className="ml-2 flex items-center overflow-hidden overflow-ellipsis whitespace-nowrap text-xs"
                >
                  {loadingSubmenuItem.description}
                </span>
              </span>
            </ItemDiv>
          )}
          {allItems.length ? (
            allItems.map((item, index) => {
              const isSelected = index === selectedIndex;
              return (
                <ItemDiv
                  as="button"
                  ref={(el) => (itemRefs.current[index] = el)}
                  className={`item cursor-pointer ${isSelected ? "is-selected" : ""}`}
                  key={index}
                  onClick={(e) => {
                    e.stopPropagation();
                    selectItem(index);
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                  data-testid="context-provider-dropdown-item"
                >
                  <span className="flex w-full items-center justify-between">
                    <div className="flex items-center justify-center">
                      {showFileIconForItem(item) ? (
                        <FileIcon
                          height="20px"
                          width="20px"
                          filename={item.description}
                        />
                      ) : (
                        <DropdownIcon item={item} className="mr-2" />
                      )}
                      <span title={item.id}>{item.title}</span>
                      {"  "}
                    </div>
                    <span
                      style={{
                        color: lightGray,
                        float: "right",
                        textAlign: "right",
                        opacity: isSelected ? 1 : 0,
                        minWidth: "30px",
                      }}
                      className="ml-2 flex items-center overflow-hidden overflow-ellipsis whitespace-nowrap text-xs"
                    >
                      {item.description}
                      {item.type === "contextProvider" &&
                        item.contextProvider?.type === "submenu" && (
                          <ArrowRightIcon
                            className="ml-2 flex-shrink-0"
                            width="1.2em"
                            height="1.2em"
                          />
                        )}
                      {item.subActions?.map((subAction) => {
                        const Icon = getIconFromDropdownItem(
                          subAction.icon,
                          "action",
                        );
                        return (
                          <HeaderButtonWithToolTip
                            onClick={(e) => {
                              subAction.action(item);
                              e.stopPropagation();
                              e.preventDefault();
                              props.onClose();
                            }}
                            text={undefined}
                          >
                            <Icon width="1.2em" height="1.2em" />
                          </HeaderButtonWithToolTip>
                        );
                      })}
                    </span>
                  </span>
                </ItemDiv>
              );
            })
          ) : (
            <ItemDiv className="item">No results</ItemDiv>
          )}
        </>
      )}
    </ItemsDiv>
  );
});
export default MentionList;
