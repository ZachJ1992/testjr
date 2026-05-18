import { Select, Tag } from "antd";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { fetchTmsOrgNodes, type TmsOrgNode } from "../api";
import { useAuth } from "../auth";

type Props = {
  value?: string;
  onChange?: (nodeId: string | undefined) => void;
  /** 选中完整节点时回调，用于表单联动写 name / tmsSource */
  onNodeSelect?: (node: TmsOrgNode | null) => void;
  tmsSource?: string;
  placeholder?: string;
};

export default function TmsOrgNodeSelect(props: Props) {
  const { tmsSource = "yaoqianshu", placeholder = "搜索网点名称或代码" } = props;
  const [options, setOptions] = useState<TmsOrgNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const deferredKeyword = useDeferredValue(keyword);
  const { token } = useAuth();

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    void fetchTmsOrgNodes(token, {
      tmsSource,
      state: "2",
      nodeType: "9,3,10,2,5",
      keyword: deferredKeyword.trim() || undefined,
      pageSize: 200,
    })
      .then((res) => {
        if (!cancelled) setOptions(res.items);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, tmsSource, deferredKeyword]);

  const selectOptions = useMemo(
    () =>
      options.map((o) => ({
        value: o.nodeId,
        label: (
          <span>
            <span>{o.shortName || o.nodeName}</span>
            {o.nodeTypeLabel ? (
              <Tag style={{ marginLeft: 6 }} color="blue">
                {o.nodeTypeLabel}
              </Tag>
            ) : null}
            {o.companyCode ? (
              <span style={{ color: "#999", marginLeft: 6, fontSize: 12 }}>
                #{o.companyCode}
              </span>
            ) : null}
          </span>
        ),
      })),
    [options]
  );

  return (
    <Select
      showSearch
      allowClear
      placeholder={placeholder}
      loading={loading}
      filterOption={false}
      onSearch={setKeyword}
      value={props.value}
      onChange={(id) => {
        props.onChange?.(id);
        if (id == null) {
          props.onNodeSelect?.(null);
          return;
        }
        const node = options.find((o) => o.nodeId === id);
        props.onNodeSelect?.(node ?? null);
      }}
      options={selectOptions}
      notFoundContent={loading ? "正在加载…" : "未找到匹配网点"}
      style={{ width: "100%" }}
    />
  );
}
