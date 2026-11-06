from app.validate import validate


def graph(nodes=(), groups=(), edges=()):
    return {"nodes": list(nodes), "groups": list(groups), "edges": list(edges)}


def n(id, icon="aws-eks", parent=None):
    return {"id": id, "attrs": {"icon": icon}, "parent": parent}


def test_unknown_icon_falls_back():
    g, issues = validate(graph([n("A", "aws-made-up")]))
    assert g["nodes"][0]["attrs"]["icon"] == "generic-service"
    assert [i["code"] for i in issues] == ["unknown_icon"]


def test_duplicate_dropped():
    g, issues = validate(graph([n("A"), n("A")]))
    assert len(g["nodes"]) == 1 and issues[0]["code"] == "duplicate_id"


def test_undeclared_edge_target_auto_created():
    g, issues = validate(graph([n("A")], edges=[{"from": "A", "to": "Monitor", "arrow": "forward"}]))
    assert any(x["id"] == "Monitor" and x.get("auto") for x in g["nodes"])
    assert issues[0]["code"] == "undeclared_node"


def test_edge_to_group_allowed():
    groups = [{"id": "VPC", "attrs": {"icon": "aws-vpc"}, "parent": None}]
    g, issues = validate(graph([n("A")], groups, [{"from": "A", "to": "VPC", "arrow": "forward"}]))
    assert issues == [] and len(g["edges"]) == 1


def test_self_loop_dropped():
    g, issues = validate(graph([n("A")], edges=[{"from": "A", "to": "A", "arrow": "forward"}]))
    assert g["edges"] == [] and issues[0]["code"] == "self_loop"
