$(document).ready(function () {
    $("div.subreq").each(function (index, element) { $(element).load("/_esi?url=" + $(element).attr("id")) });
});
