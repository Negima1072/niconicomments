import typeGuard from "./typeGuard";
import type { inputFormatType } from "@/@types/options";
import type {
  formattedComment,
  formattedLegacyComment,
} from "@/@types/format.formatted";
import type { rawApiResponse } from "@/@types/format.legacy";
import type { ownerComment } from "@/@types/format.owner";
import type { v1Thread } from "@/@types/format.v1";

/**
 * 入力されたデータを内部用のデータに変換
 * @param data {any} 入力データ(niconicome/formatted/legacy/owner/v1)
 * @param type {inputFormatType} 誤検出防止のため入力フォーマットは書かせる
 * @return {formattedComment[]} 変換後のデータを返す
 */
const convert2formattedComment = (
  data: unknown,
  type: inputFormatType
): formattedComment[] => {
  let result: formattedComment[] = [];
  if (type === "empty" && data === undefined) {
    return [];
  } else if (
    (type === "XMLDocument" || type === "niconicome") &&
    typeGuard.xmlDocument(data)
  ) {
    result = fromXMLDocument(data);
  } else if (type === "formatted" && typeGuard.formatted.legacyComments(data)) {
    result = fromFormatted(data);
  } else if (type === "legacy" && typeGuard.legacy.rawApiResponses(data)) {
    result = fromLegacy(data);
  } else if (type === "legacyOwner" && typeGuard.legacyOwner.comments(data)) {
    result = fromLegacyOwner(data);
  } else if (type === "owner" && typeGuard.owner.comments(data)) {
    result = fromOwner(data);
  } else if (type === "v1" && typeGuard.v1.threads(data)) {
    result = fromV1(data);
  } else {
    throw new Error("unknown input format");
  }
  return sort(result);
};

/**
 * niconicome等が吐き出すxml形式のコメントデータを処理する
 * @param data {XMLDocument} 吐き出されたxmlをDOMParserでparseFromStringしたもの
 * @return {formattedComment[]}
 */
const fromXMLDocument = (data: XMLDocument): formattedComment[] => {
  const data_: formattedComment[] = [],
    userList: string[] = [];
  let index = Array.from(data.documentElement.children).length;
  for (const item of Array.from(data.documentElement.children)) {
    if (item.nodeName !== "chat") continue;
    const tmpParam: formattedComment = {
      id: Number(item.getAttribute("no")) || index++,
      vpos: Number(item.getAttribute("vpos")),
      content: item.innerHTML,
      date: Number(item.getAttribute("date")) || 0,
      date_usec: Number(item.getAttribute("date_usec")) || 0,
      owner: !item.getAttribute("user_id"),
      premium: item.getAttribute("premium") === "1",
      mail: [],
      user_id: -1,
      layer: -1,
    };
    if (item.getAttribute("mail")) {
      tmpParam.mail = item.getAttribute("mail")?.split(/\s+/g) || [];
    }
    if (tmpParam.content.startsWith("/") && tmpParam.owner) {
      tmpParam.mail.push("invisible");
    }
    const userId = item.getAttribute("user_id") || "";
    const isUserExist = userList.indexOf(userId);
    if (isUserExist === -1) {
      tmpParam.user_id = userList.length;
      userList.push(userId);
    } else {
      tmpParam.user_id = isUserExist;
    }
    data_.push(tmpParam);
  }
  return data_;
};

/**
 * 内部処理用フォーマットを処理する
 * 旧版だとデータにlayerとuser_idが含まれないので追加する
 * @param data {formattedComment[] | formattedLegacyComment[]}
 * @return {formattedComment[]}
 */
const fromFormatted = (
  data: formattedComment[] | formattedLegacyComment[]
): formattedComment[] => {
  const tmpData = data as formattedComment[];
  if (!typeGuard.formatted.comments(data)) {
    for (const item of tmpData) {
      item.layer = -1;
      item.user_id = 0;
      if (!item.date_usec) item.date_usec = 0;
    }
  }
  return tmpData;
};

/**
 * ニコニコ公式のlegacy apiから帰ってきたデータ処理する
 * @param data {rawApiResponse[]}
 * @return {formattedComment[]}
 */
const fromLegacy = (data: rawApiResponse[]): formattedComment[] => {
  const data_: formattedComment[] = [],
    userList: string[] = [];
  for (let i = 0; i < data.length; i++) {
    const val = data[i];
    if (!val || !typeGuard.legacy.apiChat(val?.chat)) continue;
    const value = val.chat;
    if (value.deleted !== 1) {
      const tmpParam: formattedComment = {
        id: value.no,
        vpos: value.vpos,
        content: value.content || "",
        date: value.date,
        date_usec: value.date_usec || 0,
        owner: !value.user_id,
        premium: value.premium === 1,
        mail: [],
        user_id: -1,
        layer: -1,
      };
      if (value.mail) {
        tmpParam.mail = value.mail.split(/\s+/g);
      }
      if (value.content.startsWith("/") && !value.user_id) {
        tmpParam.mail.push("invisible");
      }
      const isUserExist = userList.indexOf(value.user_id);
      if (isUserExist === -1) {
        tmpParam.user_id = userList.length;
        userList.push(value.user_id);
      } else {
        tmpParam.user_id = isUserExist;
      }
      data_.push(tmpParam);
    }
  }
  return data_;
};

/**
 * 旧プレイヤーの投稿者コメントのエディターのデータを処理する
 * @param data {string}
 * @return {formattedComment[]}
 */
const fromLegacyOwner = (data: string): formattedComment[] => {
  const data_: formattedComment[] = [],
    comments = data.split("\n");
  for (let i = 0; i < comments.length; i++) {
    const value = comments[i];
    if (!value) continue;
    const commentData = value.split(":");
    if (commentData.length < 3) {
      continue;
    } else if (commentData.length > 3) {
      for (let j = 3; j < commentData.length; j++) {
        commentData[2] += `:${commentData[j]}`;
      }
    }
    const tmpParam: formattedComment = {
      id: i,
      vpos: Number(commentData[0]),
      content: commentData[2] || "",
      date: i,
      date_usec: 0,
      owner: true,
      premium: true,
      mail: [],
      user_id: -1,
      layer: -1,
    };
    if (commentData[1]) {
      tmpParam.mail = commentData[1].split(/[\s+]/g);
    }
    if (tmpParam.content.startsWith("/")) {
      tmpParam.mail.push("invisible");
    }
    data_.push(tmpParam);
  }
  return data_;
};

/**
 * 投稿者コメントのエディターのデータを処理する
 * @param data {ownerComment[]}
 * @return {formattedComment[]}
 */
const fromOwner = (data: ownerComment[]): formattedComment[] => {
  const data_: formattedComment[] = [];
  data.forEach((value, index) => {
    const tmpParam: formattedComment = {
      id: index,
      vpos: time2vpos(value.time),
      content: value.comment,
      date: index,
      date_usec: 0,
      owner: true,
      premium: true,
      mail: [],
      user_id: -1,
      layer: -1,
    };
    if (value.command) {
      tmpParam.mail = value.command.split(/\s+/g);
    }
    if (tmpParam.content.startsWith("/")) {
      tmpParam.mail.push("invisible");
    }
    data_.push(tmpParam);
  });
  return data_;
};

/**
 * ニコニコ公式のv1 apiから帰ってきたデータ処理する
 * data内threadsのデータを渡されることを想定
 * @param data {v1Thread[]}
 * @return {formattedComment[]}
 */
const fromV1 = (data: v1Thread[]): formattedComment[] => {
  const data_: formattedComment[] = [],
    userList: string[] = [];
  for (const item of data) {
    const val = item.comments,
      forkName = item.fork;
    for (const key of Object.keys(val)) {
      const value = val[key];
      if (!value) continue;
      const tmpParam: formattedComment = {
        id: value.no,
        vpos: Math.floor(value.vposMs / 10),
        content: value.body,
        date: date2time(value.postedAt),
        date_usec: 0,
        owner: forkName === "owner",
        premium: value.isPremium,
        mail: value.commands,
        user_id: -1,
        layer: -1,
      };
      if (tmpParam.content.startsWith("/") && tmpParam.owner) {
        tmpParam.mail.push("invisible");
      }
      const isUserExist = userList.indexOf(value.userId);
      if (isUserExist === -1) {
        tmpParam.user_id = userList.length;
        userList.push(value.userId);
      } else {
        tmpParam.user_id = isUserExist;
      }
      data_.push(tmpParam);
    }
  }
  return data_;
};

/**
 * 共通処理
 * 投稿時間、日時順にソート
 * @param data
 */
const sort = (data: formattedComment[]): formattedComment[] => {
  data.sort((a: formattedComment, b: formattedComment) => {
    if (a.vpos < b.vpos) return -1;
    if (a.vpos > b.vpos) return 1;
    if (a.date < b.date) return -1;
    if (a.date > b.date) return 1;
    if (a.date_usec < b.date_usec) return -1;
    if (a.date_usec > b.date_usec) return 1;
    return 0;
  });
  return data;
};

/**
 * 投稿者コメントのエディターは秒数の入力フォーマットに割りと色々対応しているのでvposに変換
 * @param time_str {string} 分:秒.秒・分:秒・秒.秒・秒
 * @return {number} vpos
 */
const time2vpos = (time_str: string): number => {
  const time = time_str.match(
    /^(?:(\d+):(\d+)\.(\d+)|(\d+):(\d+)|(\d+)\.(\d+)|(\d+))$/
  );
  if (time) {
    if (
      time[1] !== undefined &&
      time[2] !== undefined &&
      time[3] !== undefined
    ) {
      return (
        (Number(time[1]) * 60 + Number(time[2])) * 100 +
        Number(time[3]) / Math.pow(10, time[3].length - 2)
      );
    } else if (time[4] !== undefined && time[5] !== undefined) {
      return (Number(time[4]) * 60 + Number(time[5])) * 100;
    } else if (time[6] !== undefined && time[7] !== undefined) {
      return (
        Number(time[6]) * 100 +
        Number(time[7]) / Math.pow(10, time[7].length - 2)
      );
    } else if (time[8] !== undefined) {
      return Number(time[8]) * 100;
    }
  }
  return 0;
};

/**
 * v1 apiのpostedAtはISO 8601のtimestampなのでDate関数を使ってunix timestampに変換
 * @param date {string} ISO 8601 timestamp
 * @return {number} unix timestamp
 */
const date2time = (date: string): number =>
  Math.floor(new Date(date).getTime() / 1000);

export default convert2formattedComment;
