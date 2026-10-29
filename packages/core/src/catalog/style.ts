/**
 * Giọng văn caption + bộ caption mẫu (đã sửa chính tả và sai sự thật).
 * Sửa file này để chỉnh giọng; mỗi lần sửa nên tăng PROMPT_VERSION trong pipeline.
 */

export const STYLE_GUIDE = `Trang đăng bài: Soccerstore.vn — fanpage về giày và phụ kiện bóng đá.
Người đọc: người đam mê bóng đá, đá bóng phong trào, thích tìm hiểu giày và phụ kiện.
Giọng văn: có kiến thức và hiểu biết, pha lẫn sự vui vẻ, gần gũi.

Quy tắc:
- Viết tiếng Việt tự nhiên. Giữ nguyên tiếng Anh: tên cầu thủ, tên giày, tên bộ sưu tập/pack, tên công nghệ, tên CLB.
- Gọi người đọc là "anh em" / "ae". Có thể kết bằng một câu hỏi mở cho anh em.
- Emoji dùng vừa phải, thường đi theo cặp: 🔥🔥 😍😍 😔😔 😤😤 ⚽️⚽️ 👀.
- Hashtag dạng #HãngDòng (vd #AdidasPredator, #NikeVapor17, #MizunoAlpha) và #TênCầuThủ (vd #NicoPaz). 1–4 hashtag.
- Caption về cầu thủ/trận đấu: kể ngắn gọn diễn biến (tỉ số, bàn, kiến tạo) rồi lồng đôi giày vào như "minh chứng".
- Caption về giày: nêu tên pack/phiên bản, cảm hứng thiết kế, chi tiết nổi bật, ai sẽ mang, bối cảnh lịch sử của dòng giày nếu có.
- Không bịa số liệu, kỷ lục, ngày tháng. Điều gì không có trong bài nguồn thì không khẳng định.`;

export const GLOSSARY: Record<string, string> = {
  colorway: 'phối màu',
  boots: 'giày',
  cleats: 'giày',
  pack: 'pack / bộ sưu tập',
  collection: 'bộ sưu tập',
  leak: 'rò rỉ',
  leaked: 'rò rỉ',
  laceless: 'không dây',
  'signature boot': 'giày signature / phiên bản riêng',
  'limited edition': 'phiên bản giới hạn',
  'home kit': 'áo sân nhà',
  'away kit': 'áo sân khách',
  'third kit': 'áo thứ ba',
  'brace': 'cú đúp',
  'hat-trick': 'hat-trick',
  'assist': 'kiến tạo',
};

/** Các caption mẫu: chỉ để học giọng văn — KHÔNG dùng nội dung trong đó làm dữ kiện. */
export const EXAMPLE_CAPTIONS: string[] = [
  `Harry Edward Kane đã trở thành chủ nhân của danh hiệu cá nhân cao quý nhất trong bóng đá: Quả bóng Vàng 2026, vượt qua Mbappé và Lamine Yamal. Kane đồng thời cũng là cầu thủ đại diện đầu tiên của Skechers giành giải thưởng này. Chúc mừng Kane, chúc mừng tuyển Anh — sau 25 năm mới lại có một cầu thủ Anh giành Quả bóng Vàng, kể từ Michael Owen năm 2001.`,
  `El Clásico là sân khấu hoàn hảo để #Mbappe trình làng đôi giày #On của riêng mình với một cú đúp ⚽️⚽️`,
  `Đá bóng đôi khi chỉ cần một chiếc giày là đủ 😤😤
Johan Manzambi với nguồn năng lượng vô hạn vừa cùng Aston Villa chặn đứng chuỗi 6 trận thắng liên tiếp của #ManCity. Trong một pha tranh chấp, dù đôi #NikeVapor17 bị văng ra, anh vẫn vừa cầm giày trên tay vừa tiếp tục tranh chấp 🔥🔥`,
  `Bóng đá có lẽ là bộ môn duy nhất mà cánh đàn ông nhìn vào đồ của các chị em cũng phải thòm thèm, rồi phải kiếm cho bằng được 😔😔
// BST Nike United 004`,
  `Nhấn chìm bầy Quỷ đỏ của Michael Carrick với tỉ số 4-1 trong đêm thảm họa Champions League, Cesc Fàbregas cùng Como đang vô cùng thăng hoa. Nhân vật chính và cũng là viên ngọc sáng rực rỡ trong tay "F4" chính là Nico Paz. Tốc độ, qua người, kiến tạo, ghi bàn… Nico Paz đang làm hết mọi việc trên hàng công. Hai bàn thắng và một kiến tạo cùng đôi #AdidasPredator #FinalRush là minh chứng cho tất cả — cứ đà này thì không biết Como còn giữ chân được tiền vệ người Argentina đến bao lâu.
#MichaelCarrick #NicoPaz #Como`,
  `Có những thứ yêu bất cần biết lý do 😔😔
#MizunoAlpha`,
  `Chắc chắn không có bom tấn nào bằng bom tấn mà Nike mang đến vào năm sau 🔥🔥🔥
Chính thức: Nike sẽ hồi sinh dòng giày huyền thoại #NikeHypervenom. Hypervenom sẽ thay thế cho Phantom 6 hiện nay, đồng nghĩa với việc Phantom sẽ không còn được phát triển nữa.
Từ năm sau, chúng ta sẽ có lại ba dòng giày vô cùng quen thuộc với những ae chơi giày từ những năm 2012–2013: Mercurial, Tiempo và Hypervenom. Dàn gương mặt đại diện cho Hypervenom gồm: dẫn đầu là Erling Haaland, Cole Palmer, nữ cầu thủ Tây Ban Nha Alexia Putellas, và đặc biệt là idol Michael Olise 😍😍 Tiền đạo người Pháp vốn chưa từng đặt bút ký hợp đồng với brand nào, nhưng cũng đã bị chinh phục bởi kế hoạch Nike dành cho anh — Hypervenom vốn là đôi giày ưa thích số một của Olise, tủ giày của anh có hàng chục bản custom khác nhau để mix cho từng trận cho đến tận bây giờ 😍😍
Anh em chờ đợi điều gì nhất ở Nike Hypervenom 2027 đây? Cơ mà #Phantom6 đang ngon thì…`,
  `Diego Gómez vừa xác lập một kỷ lục cho riêng mình với siêu phẩm từ giữa sân vào lưới Crystal Palace đêm qua.
Pha dứt điểm từ khoảng cách 51 m bằng đôi #AdidasF50 Hyperfast Final Rush xanh bạc hà đã đưa tiền vệ của Brighton vào top 5 cầu thủ có bàn thắng xa nhất lịch sử Ngoại hạng Anh (không tính các thủ môn ghi bàn từ những quả phát bóng).
Ae biết top 3, 2, 1 là của những ai không?`,
  `Vitinha với đôi Nike Vapor 17 "laceless" theo cách của riêng mình đã đóng góp một bàn thắng trong chiến thắng áp đảo 4-2 trước Man City — một trận thư hùng mãn nhãn, xứng đáng top đầu châu Âu.`,
  `"Fútbol y familia" trong tiếng Tây Ban Nha có nghĩa là "bóng đá và gia đình". Đây cũng là chủ đề của đôi F50 Messi mới nhất mà adidas thửa riêng cho M10. Lấy cảm hứng từ câu lạc bộ thuở niên thiếu của Messi tại quê nhà — Newell's Old Boys — thiết kế mang hơi hướng đôi F50.6 thập niên 2000 với lưỡi gà che hết phần dây buộc phía trên và logo 3 sọc cách điệu mềm mại chạy xuôi về phía gót.`,
  `Chân ai chân ai? 👀`,
  `Nike vừa ra mắt "Bright Lights" Pack với tone trắng tinh phối cùng các chi tiết điểm nhấn xanh ngọc bích — một phần trong chiến dịch mùa thu, tập trung vào sự tinh giản, không rầm rộ mà khẳng định qua chất lượng và trải nghiệm thực tế. Nói chung là đẹp.`,
  `adidas vừa cho ra mắt hai phiên bản giày kết hợp với huyền thoại David Beckham. Một là đôi Predator remake đúng đôi giày số 7 đã mang khi lập siêu phẩm đá phạt vào lưới Hy Lạp ở phút bù giờ năm 2001, đưa tuyển Anh tới VCK World Cup 2002. Đôi còn lại là phiên bản Predator 2026 mới nhất, thiết kế lấy cảm hứng từ chính đôi remake kia 😍😍
#AdidasBeckham #PredatorBeckham`,
];
