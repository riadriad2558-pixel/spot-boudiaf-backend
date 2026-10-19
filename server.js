const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const requestIp = require('request-ip');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());
app.use(requestIp.mw());

// السماح بقراءة المجلد للوسائط المرفوعة
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// الاتصال بقاعدة البيانات (يتم سحب الرابط من إعدادات Render تلقائياً عبر MONGO_URI)
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/spot_boudiaf';
mongoose.connect(MONGO_URI)
  .then(() => console.log('تم الاتصال بقاعدة البيانات بنجاح'))
  .catch(err => console.error('خطأ في الاتصال بقاعدة البيانات:', err));

// هيكل قاعدة البيانات وتسجيل الـ IP والأمن
const PostSchema = new mongoose.Schema({
    authorName: String,
    content: String,
    mediaUrl: String,
    mediaType: String, // 'image' or 'video'
    ipAddress: String, // تسجيل عنوان الـ IP الحقيقي للشرطة والأمن
    userAgent: String,
    createdAt: { type: Date, default: Date.now }
});

const Post = mongoose.model('Post', PostSchema);

// إعداد رفع الملفات (صور وفيديوهات)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './uploads';
        const fs = require('fs');
        if (!fs.existsSync(dir)){
            fs.mkdirSync(dir);
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// تفعيل التعامل مع البروكسي والاستضافات السحابية لالتقاط الـ IP الصحيح
app.set('trust proxy', true);

// مسار النشر (تلقي الاسم، المنشور، الملف وتسجيل الـ IP فوراً)
app.post('/api/posts', upload.single('file'), async (req, res) => {
    try {
        const { authorName, content } = req.body;
        const clientIp = req.clientIp; 
        const userAgent = req.headers['user-agent'];

        if (!authorName) {
            return res.status(400).json({ error: 'الرجاء إدخال الاسم للبدء' });
        }

        let mediaUrl = null;
        let mediaType = null;

        if (req.file) {
            mediaUrl = 'uploads/' + req.file.filename;
            mediaType = req.file.mimetype.startsWith('video') ? 'video' : 'image';
        }

        const newPost = new Post({
            authorName,
            content,
            mediaUrl,
            mediaType,
            ipAddress: clientIp, // حفظ الـ IP تلقائياً
            userAgent
        });

        await newPost.save();
        res.status(201).json({ message: 'تم النشر بنجاح', post: newPost });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

// مسار جلب المنشورات للعامة (يتم إخفاء الـ IP عن الزوار العاديين للحفاظ على الخصوصية)
app.get('/api/posts', async (req, res) => {
    try {
        const posts = await Post.find().sort({ createdAt: -1 }).select('-ipAddress -userAgent');
        res.json(posts);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في جلب المنشورات' });
    }
});

// مسار لوحة تحكم الأدمن (مخصص لحساب Adminspotriad لاستخراج الـ IP عند الحاجة للشرطة)
app.get('/api/admin/audit-logs', async (req, res) => {
    const adminUser = req.headers['x-admin-user'];
    const expectedAdmin = process.env.ADMIN_ACCOUNT || 'Adminspotriad';

    if (adminUser !== expectedAdmin) {
        return res.status(403).json({ error: 'غير مسموح لك بالوصول، صلاحيات الأدمن مطلوبة لحساب Adminspotriad' });
    }

    try {
        const logs = await Post.find().sort({ createdAt: -1 });
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في استخراج السجلات' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`السيرفر يعمل بكفاءة على المنفذ ${PORT}`));
